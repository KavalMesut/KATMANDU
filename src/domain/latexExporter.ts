import { getLocale } from '../i18n';
import { translate } from '../i18n';
import { getVerificationNotice } from './verification';
/**
 * KATMANDU v2 — LaTeX Dışa Aktarma Motoru (LaTeX Exporter)
 * 
 * İlkeler:
 * - pdflatex veya xelatex ile doğrudan derlenebilen bağımsız, temiz main.tex üretir.
 * - Türkçe karakter desteği, amsmath, amssymb, tikz ve hyperref paketlerini içerir.
 * - Ana çözüm denklemleri deterministik \label{eq:N} ile etiketlenir.
 * - Seçilen derinlik seviyesine göre türetim katmanları "Ek A: Analitik İspatlar ve Kurucu Yasalar"
 *   altında \ref{eq:N} çapraz referanslarıyla konumlandırılır.
 * - SimpleDiagramSpec şemaları vektörel TikZ koduna dönüştürülür.
 */

import {
  SolutionDocument,
  ExpansionLayer,
  DerivationTreeNode,
  SimpleDiagramSpec,
  SolutionBlock,
  SolutionMetadata
} from './types';
import { cleanSectionTitle } from './trustedAssembler';
import { normalizeInlineMath } from './inlineMath';

export interface LaTeXExportOptions {
  maxDepth?: number;
  includeDiagrams?: boolean;
  inlineExpansions?: boolean;
  includeAppendix?: boolean;
  includeAssumptions?: boolean;
  includeStrategy?: boolean;
  author?: string;
  metadata?: SolutionMetadata;
}

export interface MultipleLaTeXExportOptions extends LaTeXExportOptions {
  bundleTitle?: string;
  includeTableOfContents?: boolean;
}

/**
 * Ağaçtaki maksimum derinlik seviyesini hesaplar.
 */
export function getMaxTreeDepth(tree: DerivationTreeNode): number {
  let max = 0;
  function traverse(node: DerivationTreeNode) {
    if (node.depth > max) max = node.depth;
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  traverse(tree);
  return max;
}

/**
 * Verilen maksimum derinlik (maxDepth) sınırına göre dışa aktarılacak katmanları toplar.
 * Derinlik sırasına ve hiyerarşik akışa göre sıralar.
 */
export function getLayersForExport(
  tree: DerivationTreeNode,
  maxDepth: number,
  expansionCache: Record<string, ExpansionLayer> = {}
): ExpansionLayer[] {
  if (maxDepth <= 0) return [];

  const layers: ExpansionLayer[] = [];
  const visitedIds = new Set<string>();

  function traverse(node: DerivationTreeNode) {
    if (node.id !== 'root' && node.depth <= maxDepth) {
      // Önce düğüm üzerindeki layer'ı, yoksa cache'i kontrol et
      const layer =
        node.layer ||
        Object.values(expansionCache).find((l) => l.id === node.id);

      if (layer && !visitedIds.has(layer.id)) {
        visitedIds.add(layer.id);
        layers.push(layer);
      }
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(tree);
  return layers;
}

/**
 * Metin içindeki özel karakterleri LaTeX formatına çevirir.
 * Matematik modundaki ($...$ veya $$...$$) ifadelere dokunmaz,
 * yalnızca metin (prose) kısımlarındaki tipografik tırnakları,
 * em-dash/en-dash, Yunan harflerini ve %, _, &, # karakterlerini güvenle kaçırır.
 */
export function escapeLaTeXText(text: string): string {
  if (!text) return '';

  let processed = normalizeInlineMath(text);

  // 1. Tipografik Unicode tırnak ve tireleri standart ASCII/LaTeX formatına dönüştür (pdflatex uyumu)
  processed = processed.replace(/[‘’]/g, "'");
  processed = processed.replace(/[“”]/g, '"');
  processed = processed.replace(/—/g, '---');
  processed = processed.replace(/–/g, '--');
  processed = processed.replace(/…/g, '\\dots{}');

  // 2. Metin içinde kalmış çıplak Yunan harflerini matematik moduna dönüştür
  processed = processed.replace(/θ/g, '$\\theta$');
  processed = processed.replace(/α/g, '$\\alpha$');
  processed = processed.replace(/β/g, '$\\beta$');
  processed = processed.replace(/λ/g, '$\\lambda$');
  processed = processed.replace(/ω/g, '$\\omega$');
  processed = processed.replace(/π/g, '$\\pi$');
  processed = processed.replace(/μ/g, '$\\mu$');
  processed = processed.replace(/φ/g, '$\\phi$');
  processed = processed.replace(/γ/g, '$\\gamma$');
  processed = processed.replace(/Δ/g, '$\\Delta$');
  processed = processed.replace(/Σ/g, '$\\Sigma$');

  // 3. Markdown kalın (**metin**) ve eğik (*metin*) dönüşümünü matematik ayrımından ÖNCE yap
  // Böylece **başlık ($M \to \infty$):** gibi math içeren kalın metinler ortadan bölünmez
  processed = processed.replace(/\*\*([^*]+?)\*\*/g, '\\textbf{$1}');
  processed = processed.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, '$1\\textit{$2}');
  processed = processed.replace(/`([^`]+)`/g, '\\texttt{$1}');

  // 4. Şimdi matematik bloklarını ($$...$$ veya $...$ veya \(...\) veya \[...\]) ayır
  const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^\$]+?\$|\\\(.*?\\\)|\\\[.*?\\\])/g;
  const parts = processed.split(mathRegex);

  return parts
    .map((part) => {
      // Eğer bu parça matematik moduysa dokunma, aynen koru
      if (
        (part.startsWith('$$') && part.endsWith('$$')) ||
        (part.startsWith('$') && part.endsWith('$')) ||
        (part.startsWith('\\(') && part.endsWith('\\)')) ||
        (part.startsWith('\\[') && part.endsWith('\\]'))
      ) {
        return part;
      }

      // 5. Metin modunda kalmış çıplak LaTeX matematik komutlarını ($...$ dışında kalanlar) tespit et ve $...$ içine sar
      let escaped = part;
      escaped = escaped.replace(
        /\\(theta|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|sqrt|frac|vec|dot|ddot|hat|infty|nabla|partial|pm|approx|leq|geq|neq|times|cdot|to|implies)\b(?:\{[^}]*\})*/g,
        (match) => `$${match}$`
      );

      // 6. Yalnızca metin modundaki özel karakterleri kaçır
      escaped = escaped.replace(/&/g, '\\&');
      escaped = escaped.replace(/%/g, '\\%');
      escaped = escaped.replace(/#/g, '\\#');
      escaped = escaped.replace(/_/g, '\\_');
      escaped = escaped.replace(/\^/g, '\\textasciicircum{}');
      escaped = escaped.replace(/~/g, '\\textasciitilde{}');

      return escaped;
    })
    .join('');
}

/**
 * TikZ düğümleri (node) için etiketleri güvenli LaTeX koduna dönüştürür.
 * - LaTeX math içeren (\vec, \theta, m_1, L) sembolleri daima $...$ içine sarar.
 * - Bu sayede text modundaki \vec veya \theta komutlarının \@nomath ile
 *   sonsuz döngüye girip "TeX capacity exceeded" hatası vermesini kesin olarak engeller.
 */
export function formatTikZLabel(rawLabel?: string): string {
  if (!rawLabel) return '';
  const trimmed = rawLabel.trim();
  if (!trimmed) return '';

  // Zaten $...$ ile sarılmışsa doğrudan döndür
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    return trimmed;
  }

  // Eğer \vec, \theta, \alpha, alt simge (_), üst simge (^) veya tek harfli bir değişkense (m, L, x, y, O, g):
  const hasMathCommands = /\\[a-zA-Z]+|[_^]/.test(trimmed);
  const isSingleSymbol = /^[a-zA-Z]$/.test(trimmed);

  if (hasMathCommands || isSingleSymbol) {
    if (!trimmed.includes('$')) {
      return `$${trimmed}$`;
    }
  }

  // Metin açıklaması (Örn: "Düşey eksen", "O (Tavan)"):
  return escapeLaTeXText(trimmed);
}

/**
 * Güvenli koordinat ayrıştırıcı:
 * [x, y] dizisi veya {x, y} / {x1, y1} nesnesi gelebilir;
 * model çıktısındaki varyasyonları güvenle parse eder.
 */
function parseCoord(val: unknown): [number, number] | null {
  if (!val) return null;
  if (Array.isArray(val) && val.length >= 2) {
    const x = Number(val[0]);
    const y = Number(val[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    const x = Number(obj.x ?? obj.x1 ?? 0);
    const y = Number(obj.y ?? obj.y1 ?? 0);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  return null;
}

/**
 * KATMANDU vektörel şema tanımlarını (SimpleDiagramSpec) derlenebilir TikZ koduna çevirir.
 * Fail-soft çalışır; eksik koordinat veya bozuk öğeler sistemi çökertmez.
 */
export function diagramToTikZ(spec: SimpleDiagramSpec): string {
  try {
    if (!spec || !spec.elements || !Array.isArray(spec.elements) || spec.elements.length === 0) {
      return '';
    }

    const width = Number(spec.width) || 400;
    const height = Number(spec.height) || 250;
    const widthScale = 0.035; // 400px yaklaşık 14cm
    const lines: string[] = [];

    lines.push('  \\begin{tikzpicture}[');
    lines.push(`    scale=${widthScale},`);
    lines.push('    yscale=-1,');
    lines.push('    >={Stealth[length=2.5mm]},');
    lines.push('    every node/.style={font=\\small}');
    lines.push('  ]');

    // Çerçeve kılavuzu (arka plan sınırlayıcı)
    lines.push(translate("    % Şema Sınırları: {0}x{1}", [width, height]));
    lines.push(`    \\path[use as bounding box] (0, 0) rectangle (${width}, ${height});`);

    for (const rawEl of spec.elements) {
      if (!rawEl || typeof rawEl !== 'object') continue;
      const el = rawEl as Record<string, any>;
      const type = el.type;

      switch (type) {
        case 'mass': {
          const x = Number(el.x ?? 0);
          const y = Number(el.y ?? 0);
          const shape = el.shape === 'circle' ? 'circle' : 'rectangle';
          const label = formatTikZLabel(el.label || 'm');
          lines.push(
            `    \\node[draw, thick, ${shape}, fill=gray!15, inner sep=4pt] at (${x}, ${y}) {${label}};`
          );
          break;
        }
        case 'point': {
          const x = Number(el.x ?? 0);
          const y = Number(el.y ?? 0);
          const label = el.label ? ` node[above right] {${formatTikZLabel(el.label)}}` : '';
          lines.push(`    \\filldraw[black] (${x}, ${y}) circle (2.5pt)${label};`);
          break;
        }
        case 'line': {
          const from = parseCoord(el.from);
          const to = parseCoord(el.to);
          if (!from || !to) break;
          let style = 'thick';
          if (el.style === 'dashed') style = 'dashed, thick';
          if (el.style === 'rope') style = 'very thick, line cap=round';
          if (el.style === 'spring') {
            style = 'thick, decorate, decoration={coil, aspect=0.6, segment length=6pt, amplitude=4pt}';
          }
          const label = el.label ? ` node[midway, above] {${formatTikZLabel(el.label)}}` : '';
          lines.push(
            `    \\draw[${style}] (${from[0]}, ${from[1]}) -- (${to[0]}, ${to[1]})${label};`
          );
          break;
        }
        case 'vector': {
          const from = parseCoord(el.from);
          const to = parseCoord(el.to);
          if (!from || !to) break;
          const label = formatTikZLabel(el.label || '');
          const labelNode = label ? ` node[pos=1.05] {${label}}` : '';
          lines.push(
            `    \\draw[->, very thick] (${from[0]}, ${from[1]}) -- (${to[0]}, ${to[1]})${labelNode};`
          );
          break;
        }
        case 'axis': {
          const origin = parseCoord(el.origin);
          if (!origin) break;
          const xLength = Number(el.xLength ?? 60);
          const yLength = Number(el.yLength ?? 60);
          const xLab = el.xLabel ? formatTikZLabel(el.xLabel) : '$x$';
          const yLab = el.yLabel ? formatTikZLabel(el.yLabel) : '$y$';
          lines.push(
            `    \\draw[->, thick] (${origin[0]}, ${origin[1]}) -- (${origin[0] + xLength}, ${origin[1]}) node[right] {${xLab}};`
          );
          lines.push(
            `    \\draw[->, thick] (${origin[0]}, ${origin[1]}) -- (${origin[0]}, ${origin[1] - yLength}) node[above] {${yLab}};`
          );
          break;
        }
        case 'angle': {
          const center = parseCoord(el.center);
          if (!center) break;
          const radius = Number(el.radius ?? 20);
          const startAngle = Number(el.startAngle ?? 0);
          const endAngle = Number(el.endAngle ?? 90);
          const label = formatTikZLabel(el.label || '');
          const labelNode = label ? ` node[midway, fill=white, inner sep=1pt] {${label}}` : '';
          lines.push(
            `    \\draw (${center[0]}, ${center[1]}) ++(${startAngle}:${radius}) arc (${startAngle}:${endAngle}:${radius})${labelNode};`
          );
          break;
        }
        case 'surface': {
          const from = parseCoord(el.from);
          const to = parseCoord(el.to);
          if (!from || !to) break;
          lines.push(
            `    \\draw[ultra thick] (${from[0]}, ${from[1]}) -- (${to[0]}, ${to[1]});`
          );
          break;
        }
        case 'polygon': {
          if (Array.isArray(el.points) && el.points.length > 1) {
            const pts = el.points
              .map((p: unknown) => parseCoord(p))
              .filter((p: [number, number] | null): p is [number, number] => p !== null);
            if (pts.length > 1) {
              const ptStr = pts.map(([px, py]) => `(${px}, ${py})`).join(' -- ');
              lines.push(`    \\draw[thick, fill=gray!10] ${ptStr} -- cycle;`);
            }
          }
          break;
        }
        case 'curve': {
          if (Array.isArray(el.points) && el.points.length > 1) {
            const pts = el.points
              .map((p: unknown) => parseCoord(p))
              .filter((p: [number, number] | null): p is [number, number] => p !== null);
            if (pts.length > 1) {
              const ptCoords = pts.map(([px, py]) => `(${px}, ${py})`).join(' ');
              let style = 'thick';
              if (el.style === 'dashed') style = 'dashed, thick';
              else if (el.style === 'dotted') style = 'dotted, thick';

              if (el.fillUnder) {
                const baselineY = typeof el.fillBaselineY === 'number'
                  ? el.fillBaselineY
                  : Math.max(...pts.map((p) => p[1]));
                const firstX = pts[0][0];
                const lastX = pts[pts.length - 1][0];
                lines.push(
                  `    \\fill[blue!15] (${firstX}, ${baselineY}) -- plot[smooth] coordinates {${ptCoords}} -- (${lastX}, ${baselineY}) -- cycle;`
                );
              }

              const label = el.label ? ` node[above, font=\\small] {${formatTikZLabel(el.label)}}` : '';
              lines.push(
                `    \\draw[${style}, blue!80!black] plot[smooth] coordinates {${ptCoords}}${label};`
              );
            }
          }
          break;
        }
        case 'pulley': {
          const center = parseCoord(el.center);
          if (!center) break;
          const r = Number(el.radius ?? 15);
          lines.push(
            `    \\draw[thick, fill=gray!20] (${center[0]}, ${center[1]}) circle (${r});`
          );
          lines.push(
            `    \\filldraw[black] (${center[0]}, ${center[1]}) circle (2.5pt);`
          );
          break;
        }
        case 'resistor': {
          const from = parseCoord(el.from);
          const to = parseCoord(el.to);
          if (!from || !to) break;
          const label = el.label ? ` node[midway, above] {${formatTikZLabel(el.label)}}` : '';
          lines.push(
            `    \\draw[thick] (${from[0]}, ${from[1]}) -- (${to[0]}, ${to[1]})${label};`
          );
          break;
        }
        case 'capacitor': {
          const from = parseCoord(el.from);
          const to = parseCoord(el.to);
          if (!from || !to) break;
          lines.push(
            `    \\draw[thick] (${from[0]}, ${from[1]}) -- (${to[0]}, ${to[1]});`
          );
          break;
        }
        case 'source': {
          const center = parseCoord(el.center);
          if (!center) break;
          const label = el.label ? ` node[above] {${formatTikZLabel(el.label)}}` : '';
          lines.push(
            `    \\draw[thick, fill=white] (${center[0]}, ${center[1]}) circle (12)${label};`
          );
          break;
        }
        case 'ground': {
          const at = parseCoord(el.at);
          if (!at) break;
          lines.push(
            `    \\draw[thick] (${at[0] - 10}, ${at[1]}) -- (${at[0] + 10}, ${at[1]});`
          );
          lines.push(
            `    \\draw[thick] (${at[0] - 6}, ${at[1] + 3}) -- (${at[0] + 6}, ${at[1] + 3});`
          );
          lines.push(
            `    \\draw[thick] (${at[0] - 2}, ${at[1] + 6}) -- (${at[0] + 2}, ${at[1] + 6});`
          );
          break;
        }
        default:
          break;
      }
    }

    lines.push('  \\end{tikzpicture}');

    const caption = spec.caption ? escapeLaTeXText(spec.caption) : 'Fiziksel Kurulum ve Koordinat Sistemi';

    return [
      '\\begin{figure}[htbp]',
      '  \\centering',
      lines.join('\n'),
      `  \\caption{${caption}}`,
      '\\end{figure}'
    ].join('\n');
  } catch (err) {
    console.warn('diagramToTikZ dönüştürme hatası (fail-soft):', err);
    return translate("% Şema TikZ formatına aktarılamadı (fail-soft)\n");
  }
}

/**
 * Bir bloğu (prose, equation, diagram) LaTeX koduna dönüştürür.
 */
function renderBlockToLaTeX(
  block: SolutionBlock,
  includeDiagrams: boolean = true
): string {
  if (block.kind === 'prose') {
    return escapeLaTeXText(block.text);
  }

  if (block.kind === 'equation') {
    let cleanLatex = (block.latex || '').trim();

    // 1. Dış $$ veya $ sarmalarını temizle
    if (cleanLatex.startsWith('$$') && cleanLatex.endsWith('$$')) {
      cleanLatex = cleanLatex.slice(2, -2).trim();
    } else if (cleanLatex.startsWith('$') && cleanLatex.endsWith('$')) {
      cleanLatex = cleanLatex.slice(1, -1).trim();
    }

    // 2. Dış \[ ... \] sarmalarını temizle
    if (cleanLatex.startsWith('\\[') && cleanLatex.endsWith('\\]')) {
      cleanLatex = cleanLatex.slice(2, -2).trim();
    }

    // 3. Dış \begin{equation} veya \begin{equation*} veya \begin{displaymath} sarmalarını temizle
    cleanLatex = cleanLatex
      .replace(/^\\begin\{equation\*?\}/, '')
      .replace(/\\end\{equation\*?\}$/, '')
      .replace(/^\\begin\{displaymath\}/, '')
      .replace(/\\end\{displaymath\}$/, '')
      .trim();

    // 4. Model \begin{align} veya \begin{align*} veya \begin{gather} döndürmüşse,
    // equation ortamı içerisine align konulamaz (erroneous nesting of equation structures).
    // Bunları güvenli alt ortam olan aligned / gathered'a dönüştür:
    cleanLatex = cleanLatex
      .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
      .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
      .replace(/\\begin\{gather\*?\}/g, '\\begin{gathered}')
      .replace(/\\end\{gather\*?\}/g, '\\end{gathered}')
      .trim();

    // 5. İçeride kalmış eski \label{...} varsa temizle (dışarıda deterministik \label{eq:N} veriyoruz)
    if (block.displayNumber !== undefined) {
      cleanLatex = cleanLatex.replace(/\\label\{[^}]+\}/g, '').trim();
    }

    const lines: string[] = [];

    // Denklem açıklaması varsa öncesinde küçük italik bir not ekle
    if (block.explanation) {
      lines.push(`\\noindent \\textit{${escapeLaTeXText(block.explanation)}:}`);
    }

    const isMultiline =
      (cleanLatex.includes('\\\\') || cleanLatex.includes('&')) &&
      !cleanLatex.includes('\\begin{aligned}') &&
      !cleanLatex.includes('\\begin{split}') &&
      !cleanLatex.includes('\\begin{gathered}') &&
      !cleanLatex.includes('\\begin{cases}') &&
      !cleanLatex.includes('\\begin{matrix}') &&
      !cleanLatex.includes('\\begin{pmatrix}');

    if (block.displayNumber !== undefined) {
      lines.push('\\begin{equation}');
      lines.push(`  \\label{eq:${block.displayNumber}}`);
      if (isMultiline) {
        lines.push('  \\begin{aligned}');
        lines.push(`    ${cleanLatex}`);
        lines.push('  \\end{aligned}');
      } else {
        lines.push(`  ${cleanLatex}`);
      }
      lines.push('\\end{equation}');
    } else {
      if (isMultiline) {
        lines.push('\\[');
        lines.push('  \\begin{aligned}');
        lines.push(`    ${cleanLatex}`);
        lines.push('  \\end{aligned}');
        lines.push('\\]');
      } else {
        lines.push('\\[');
        lines.push(`  ${cleanLatex}`);
        lines.push('\\]');
      }
    }

    return lines.join('\n');
  }

  if (block.kind === 'diagram' && includeDiagrams && block.spec) {
    return diagramToTikZ(block.spec);
  }

  return '';
}

/**
 * Tekil bir türetim katmanını derinliğine uygun pastel renkli tcolorbox içinde render eder.
 */
function renderLayerToLaTeX(
  layer: ExpansionLayer,
  includeDiagrams: boolean,
  layersByTargetId: Record<string, ExpansionLayer[]>,
  renderedLayerIds: Set<string>
): string {
  renderedLayerIds.add(layer.id);
  const depth = layer.depth;
  const colBack =
    depth === 1
      ? 'katmandudepth1'
      : depth === 2
      ? 'katmandudepth2'
      : depth === 3
      ? 'katmandudepth3'
      : 'katmandudepth4';
  const colFrame =
    depth === 1
      ? 'katmandudepth1border'
      : depth === 2
      ? 'katmandudepth2border'
      : depth === 3
      ? 'katmandudepth3border'
      : 'katmandudepth4border';

  const targetInfo =
    layer.targetDisplayNumber !== undefined
      ? translate("(Denklem~\\ref{eq:{0}} için türetim)", [layer.targetDisplayNumber])
      : `(Derinlik ${layer.depth})`;

  const safeTitle = escapeLaTeXText(layer.title || '');
  const lines: string[] = [];

  const isNested = depth > 1;
  const breakOption = isNested ? 'unbreakable' : 'breakable';

  lines.push(
    translate("\\begin{tcolorbox}[colback={0}, colframe={1}, title={\\textbf{Katman Derinliği {2}: {3} {4}}}, {5}, boxrule=0.8pt, arc=2pt]", [colBack, colFrame, layer.depth, safeTitle, targetInfo, breakOption])
  );

  if (layer.contextualQuery) {
    lines.push(
      translate("\\noindent \\textit{\\small Sorgulanan İfade / Açıklama: \"{0}\"}\\\\[0.4em]", [escapeLaTeXText(layer.contextualQuery)])
    );
  }

  const layerBlocks = layer.blocks || [];
  for (const block of layerBlocks) {
    if (!block) continue;
    try {
      const rendered = renderBlockToLaTeX(block, includeDiagrams);
      if (rendered && rendered.trim()) {
        lines.push(rendered);
        lines.push('');
      }
      // Bu katmanın içindeki alt denklem için açılmış iç katmanlar (özyineli)
      const childLayers = (layersByTargetId[block.id] || []).filter(
        (l) => !renderedLayerIds.has(l.id)
      );
      for (const child of childLayers) {
        lines.push(renderLayerToLaTeX(child, includeDiagrams, layersByTargetId, renderedLayerIds));
        lines.push('');
      }
    } catch (err) {
      console.warn('LaTeX katman blok render hatası:', err);
    }
  }

  // Bu katmanın geneline yönelik açılmış alt katmanlar
  const layerLevelChildren = (layersByTargetId[layer.id] || []).filter(
    (l) => !renderedLayerIds.has(l.id)
  );
  for (const child of layerLevelChildren) {
    lines.push(renderLayerToLaTeX(child, includeDiagrams, layersByTargetId, renderedLayerIds));
    lines.push('');
  }

  if (layer.isAxiomatic) {
    const axiomTitle =
      layer.axiomType === 'mathematics'
        ? translate("Aksiyomatik Düzey (Formel Matematik / Geometrik Postulat)")
        : translate("Kurucu Doğa Yasası (Fiziksel Aksiyom)");
    lines.push(
      `\\begin{tcolorbox}[colback=green!10!white, colframe=green!60!black, title={\\textbf{${axiomTitle}}}, unbreakable, boxrule=0.5pt, arc=2pt]`
    );
    lines.push(
      layer.axiomType === 'mathematics'
        ? translate("Bu ilke, Öklid geometrisinin kurucu aksiyomudur. Düzlem uzay kabulleri altında mantıksal olarak daha ilksel bir ilkeden türetilemez; tüm geometrik teoremler bu aksiyomatik temel üzerine kuruludur.")
        : translate("Bu ilke, klasik mekaniğin deney ve gözlemle doğrulanmış kurucu doğa yasasıdır. Matematiksel olarak daha ilksel bir ilkeden türetilemez.")
    );
    lines.push('\\end{tcolorbox}');
  }

  lines.push('\\end{tcolorbox}');
  return lines.join('\n');
}

/**
 * Ortak LaTeX Preamble (Paketler, Unicode tanımları, renkler ve tcolorbox ayarları)
 */
export function getLaTeXPreamble(): string[] {
  const lines: string[] = [];
  lines.push('\\documentclass[12pt,a4paper]{article}');
  lines.push('\\usepackage{iftex}');
  lines.push('\\ifPDFTeX');
  lines.push('  \\usepackage[utf8]{inputenc}');
  lines.push('  \\usepackage[T1]{fontenc}');
  lines.push('  \\usepackage{textcomp}');
  lines.push(`  \\usepackage[shorthands=off,${getLocale() === 'tr-TR' ? 'turkish' : 'english'}]{babel}`);
  lines.push('\\else');
  lines.push('  \\usepackage{fontspec}');
  lines.push(`  \\usepackage[shorthands=off,${getLocale() === 'tr-TR' ? 'turkish' : 'english'}]{babel}`);
  lines.push('\\fi');
  lines.push('\\usepackage{amsmath,amssymb,amsfonts,amsthm}');
  lines.push('\\usepackage{bm}');
  lines.push('\\usepackage{cancel}');
  lines.push('\\usepackage[a4paper, margin=18mm, top=16mm, bottom=18mm]{geometry}');
  lines.push('\\usepackage{microtype}');
  lines.push('\\usepackage{tikz}');
  lines.push('\\usetikzlibrary{arrows.meta,calc,decorations.pathmorphing,shapes.geometric,babel}');
  lines.push('\\usepackage{tcolorbox}');
  lines.push('\\tcbuselibrary{breakable}');
  lines.push('\\usepackage{hyperref}');
  lines.push('');
  lines.push(translate("% Sık kullanılan fizik, türev ve operatör makroları için güvenli tanımlar"));
  lines.push('\\providecommand{\\dd}{\\mathrm{d}}');
  lines.push('\\providecommand{\\dv}[2]{\\frac{\\mathrm{d} #1}{\\mathrm{d} #2}}');
  lines.push('\\providecommand{\\pdv}[2]{\\frac{\\partial #1}{\\partial #2}}');
  lines.push('\\providecommand{\\abs}[1]{\\left| #1 \\right|}');
  lines.push('\\providecommand{\\norm}[1]{\\left\\| #1 \\right\\|}');
  lines.push('');
  lines.push(translate("% pdflatex için genişletilmiş Unicode karakter eşlemeleri"));
  lines.push('\\ifPDFTeX');
  lines.push('  \\DeclareUnicodeCharacter{2019}{\'}');
  lines.push('  \\DeclareUnicodeCharacter{2018}{\'}');
  lines.push('  \\DeclareUnicodeCharacter{2014}{---}');
  lines.push('  \\DeclareUnicodeCharacter{2013}{--}');
  lines.push('  \\DeclareUnicodeCharacter{2026}{\\dots}');
  lines.push('  \\DeclareUnicodeCharacter{00D7}{\\ensuremath{\\times}}');
  lines.push('  \\DeclareUnicodeCharacter{00F7}{\\ensuremath{\\div}}');
  lines.push('  \\DeclareUnicodeCharacter{00B1}{\\ensuremath{\\pm}}');
  lines.push('  \\DeclareUnicodeCharacter{2213}{\\ensuremath{\\mp}}');
  lines.push('  \\DeclareUnicodeCharacter{2264}{\\ensuremath{\\le}}');
  lines.push('  \\DeclareUnicodeCharacter{2265}{\\ensuremath{\\ge}}');
  lines.push('  \\DeclareUnicodeCharacter{2260}{\\ensuremath{\\neq}}');
  lines.push('  \\DeclareUnicodeCharacter{2248}{\\ensuremath{\\approx}}');
  lines.push('  \\DeclareUnicodeCharacter{2261}{\\ensuremath{\\equiv}}');
  lines.push('  \\DeclareUnicodeCharacter{221E}{\\ensuremath{\\infty}}');
  lines.push('  \\DeclareUnicodeCharacter{221A}{\\ensuremath{\\sqrt{}}}');
  lines.push('  \\DeclareUnicodeCharacter{222B}{\\ensuremath{\\int}}');
  lines.push('  \\DeclareUnicodeCharacter{2202}{\\ensuremath{\\partial}}');
  lines.push('  \\DeclareUnicodeCharacter{2207}{\\ensuremath{\\nabla}}');
  lines.push('  \\DeclareUnicodeCharacter{2211}{\\ensuremath{\\sum}}');
  lines.push('  \\DeclareUnicodeCharacter{220F}{\\ensuremath{\\prod}}');
  lines.push('  \\DeclareUnicodeCharacter{2208}{\\ensuremath{\\in}}');
  lines.push('  \\DeclareUnicodeCharacter{2209}{\\ensuremath{\\notin}}');
  lines.push('  \\DeclareUnicodeCharacter{2192}{\\ensuremath{\\to}}');
  lines.push('  \\DeclareUnicodeCharacter{2190}{\\ensuremath{\\leftarrow}}');
  lines.push('  \\DeclareUnicodeCharacter{21D2}{\\ensuremath{\\implies}}');
  lines.push('  \\DeclareUnicodeCharacter{21D4}{\\ensuremath{\\iff}}');
  lines.push('  \\DeclareUnicodeCharacter{2022}{\\ensuremath{\\bullet}}');
  lines.push('  \\DeclareUnicodeCharacter{00B0}{\\ensuremath{^\\circ}}');
  lines.push('  \\DeclareUnicodeCharacter{2032}{\' }');
  lines.push('  \\DeclareUnicodeCharacter{2033}{\'\'}');
  lines.push('  \\DeclareUnicodeCharacter{00B2}{\\ensuremath{^2}}');
  lines.push('  \\DeclareUnicodeCharacter{00B3}{\\ensuremath{^3}}');
  lines.push('  \\DeclareUnicodeCharacter{00B9}{\\ensuremath{^1}}');
  lines.push('  \\DeclareUnicodeCharacter{2070}{\\ensuremath{^0}}');
  lines.push('  \\DeclareUnicodeCharacter{00B7}{\\ensuremath{\\cdot}}');
  lines.push('  \\DeclareUnicodeCharacter{00BD}{\\ensuremath{\\frac{1}{2}}}');
  lines.push('  \\DeclareUnicodeCharacter{2153}{\\ensuremath{\\frac{1}{3}}}');
  lines.push('  \\DeclareUnicodeCharacter{00BC}{\\ensuremath{\\frac{1}{4}}}');
  lines.push('  \\DeclareUnicodeCharacter{03B1}{\\ensuremath{\\alpha}}');
  lines.push('  \\DeclareUnicodeCharacter{03B2}{\\ensuremath{\\beta}}');
  lines.push('  \\DeclareUnicodeCharacter{03B3}{\\ensuremath{\\gamma}}');
  lines.push('  \\DeclareUnicodeCharacter{03B4}{\\ensuremath{\\delta}}');
  lines.push('  \\DeclareUnicodeCharacter{03B5}{\\ensuremath{\\varepsilon}}');
  lines.push('  \\DeclareUnicodeCharacter{03B6}{\\ensuremath{\\zeta}}');
  lines.push('  \\DeclareUnicodeCharacter{03B7}{\\ensuremath{\\eta}}');
  lines.push('  \\DeclareUnicodeCharacter{03B8}{\\ensuremath{\\theta}}');
  lines.push('  \\DeclareUnicodeCharacter{03B9}{\\ensuremath{\\iota}}');
  lines.push('  \\DeclareUnicodeCharacter{03BA}{\\ensuremath{\\kappa}}');
  lines.push('  \\DeclareUnicodeCharacter{03BB}{\\ensuremath{\\lambda}}');
  lines.push('  \\DeclareUnicodeCharacter{03BC}{\\ensuremath{\\mu}}');
  lines.push('  \\DeclareUnicodeCharacter{03BD}{\\ensuremath{\\nu}}');
  lines.push('  \\DeclareUnicodeCharacter{03BE}{\\ensuremath{\\xi}}');
  lines.push('  \\DeclareUnicodeCharacter{03C0}{\\ensuremath{\\pi}}');
  lines.push('  \\DeclareUnicodeCharacter{03C1}{\\ensuremath{\\rho}}');
  lines.push('  \\DeclareUnicodeCharacter{03C3}{\\ensuremath{\\sigma}}');
  lines.push('  \\DeclareUnicodeCharacter{03C4}{\\ensuremath{\\tau}}');
  lines.push('  \\DeclareUnicodeCharacter{03C5}{\\ensuremath{\\upsilon}}');
  lines.push('  \\DeclareUnicodeCharacter{03C6}{\\ensuremath{\\phi}}');
  lines.push('  \\DeclareUnicodeCharacter{03C7}{\\ensuremath{\\chi}}');
  lines.push('  \\DeclareUnicodeCharacter{03C8}{\\ensuremath{\\psi}}');
  lines.push('  \\DeclareUnicodeCharacter{03C9}{\\ensuremath{\\omega}}');
  lines.push('  \\DeclareUnicodeCharacter{0393}{\\ensuremath{\\Gamma}}');
  lines.push('  \\DeclareUnicodeCharacter{0394}{\\ensuremath{\\Delta}}');
  lines.push('  \\DeclareUnicodeCharacter{0398}{\\ensuremath{\\Theta}}');
  lines.push('  \\DeclareUnicodeCharacter{039B}{\\ensuremath{\\Lambda}}');
  lines.push('  \\DeclareUnicodeCharacter{039E}{\\ensuremath{\\Xi}}');
  lines.push('  \\DeclareUnicodeCharacter{03A0}{\\ensuremath{\\Pi}}');
  lines.push('  \\DeclareUnicodeCharacter{03A3}{\\ensuremath{\\Sigma}}');
  lines.push('  \\DeclareUnicodeCharacter{03A5}{\\ensuremath{\\Upsilon}}');
  lines.push('  \\DeclareUnicodeCharacter{03A6}{\\ensuremath{\\Phi}}');
  lines.push('  \\DeclareUnicodeCharacter{03A8}{\\ensuremath{\\Psi}}');
  lines.push('  \\DeclareUnicodeCharacter{03A9}{\\ensuremath{\\Omega}}');
  lines.push('\\fi');
  lines.push(translate("% Derinlik Seviyelerine Göre Pastel Renkler"));
  lines.push('\\definecolor{katmandudepth1}{RGB}{250, 245, 235}');
  lines.push('\\definecolor{katmandudepth1border}{RGB}{180, 83, 9}');
  lines.push('\\definecolor{katmandudepth2}{RGB}{240, 245, 250}');
  lines.push('\\definecolor{katmandudepth2border}{RGB}{37, 99, 235}');
  lines.push('\\definecolor{katmandudepth3}{RGB}{239, 248, 243}');
  lines.push('\\definecolor{katmandudepth3border}{RGB}{5, 150, 105}');
  lines.push('\\definecolor{katmandudepth4}{RGB}{248, 243, 250}');
  lines.push('\\definecolor{katmandudepth4border}{RGB}{124, 58, 237}');
  lines.push('');
  lines.push('\\hypersetup{');
  lines.push('    colorlinks=true,');
  lines.push('    linkcolor=blue!70!black,');
  lines.push('    citecolor=blue!70!black,');
  lines.push('    urlcolor=blue!70!black');
  lines.push('}');
  lines.push('');
  lines.push('\\tcbset{');
  lines.push('    colback=gray!4!white,');
  lines.push('    colframe=gray!40!black,');
  lines.push('    sharp corners,');
  lines.push('    boxrule=0.6pt,');
  lines.push('    left=8pt,');
  lines.push('    right=8pt,');
  lines.push('    top=6pt,');
  lines.push('    bottom=6pt,');
  lines.push('    breakable');
  lines.push('}');
  return lines;
}

/**
 * Tek bir problem için LaTeX gövdesini oluşturur (Başlık, problem, varsayımlar, bölümler, yerinde katmanlar)
 */
export function renderProblemBodyToLaTeX(
  document: SolutionDocument,
  layers: ExpansionLayer[] = [],
  options: LaTeXExportOptions = {},
  problemIndex?: number,
  totalProblems?: number
): string[] {
  const {
    includeDiagrams = true,
    inlineExpansions = true,
    includeAppendix = true,
    includeAssumptions = true,
    includeStrategy = true
  } = options;

  const docLines: string[] = [];

  const safeTitle = escapeLaTeXText(document.problemTitle || translate("Bilimsel Çözüm Raporu"));
  const meta = options.metadata || document.metadata;
  const safeModel = escapeLaTeXText(meta?.modelName || 'Akademik Model');
  const dateObj = meta?.solvedAt ? new Date(meta.solvedAt) : new Date();
  const safeDate = escapeLaTeXText(
    dateObj.toLocaleDateString(getLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  );

  const prefix =
    problemIndex !== undefined
      ? totalProblems
        ? `Problem ${problemIndex}/${totalProblems}: `
        : `Problem ${problemIndex}: `
      : '';

  docLines.push('\\begin{center}');
  docLines.push(`  {\\LARGE \\textbf{${prefix}${safeTitle}}} \\\\[0.5em]`);
  docLines.push(
    `  {\\footnotesize \\textbf{Model:} \\texttt{${safeModel}} \\quad $\\bullet$ \\quad \\textbf{Tarih:} ${safeDate}} \\\\[0.3em]`
  );
  docLines.push('  \\rule{\\textwidth}{0.8pt}');
  docLines.push('\\end{center}');
  docLines.push('\\vspace{-0.4em}');
  docLines.push('');

  // Problem Bölümü
  const problemLabel =
    problemIndex !== undefined
      ? totalProblems
        ? `PROBLEM ${problemIndex} / ${totalProblems}`
        : `PROBLEM ${problemIndex}`
      : 'PROBLEM';
  docLines.push(`\\noindent\\textbf{\\large ${problemLabel}}\\\\[0.2em]`);
  docLines.push('\\begin{tcolorbox}');
  const problemTextSafe = escapeLaTeXText(
    document.problemText || translate("Problem görsel/doküman üzerinden çözümlenmiştir.")
  );
  docLines.push(problemTextSafe);
  docLines.push('\\end{tcolorbox}');
  docLines.push('');

  // Orijinal Problem Diyagramı (Varsa)
  if (includeDiagrams && document.problemDiagram) {
    try {
      const tikz = diagramToTikZ(document.problemDiagram);
      if (tikz) {
        docLines.push(tikz);
        docLines.push('');
      }
    } catch (e) {
      console.warn('LaTeX problemDiagram dönüştürme hatası:', e);
    }
  }

  // Çözüm Stratejisi & Model Varsayımları
  docLines.push(escapeLaTeXText(getVerificationNotice(document)), '\n');

  if (includeStrategy && document.strategy) {
    docLines.push('\\vspace{0.2em}');
    docLines.push(translate("\\noindent\\textbf{Çözüm Stratejisi:} {0}\\\\[0.4em]", [escapeLaTeXText(document.strategy)]));
  }

  if (includeAssumptions && Array.isArray(document.assumptions) && document.assumptions.length > 0) {
    docLines.push('\\vspace{0.2em}');
    docLines.push(translate("\\noindent\\textbf{Model Varsayımları:}\\vspace{-0.3em}"));
    docLines.push('\\begin{itemize}\\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}');
    for (const asm of document.assumptions) {
      if (asm) {
        docLines.push(`  \\item ${escapeLaTeXText(asm)}`);
      }
    }
    docLines.push('\\end{itemize}');
    docLines.push('');
  }

  const safeLayers = layers || [];
  const layersByTargetId: Record<string, ExpansionLayer[]> = {};
  for (const layer of safeLayers) {
    if (layer) {
      const key = layer.targetBlockId || 'root';
      if (!layersByTargetId[key]) layersByTargetId[key] = [];
      layersByTargetId[key].push(layer);
    }
  }
  const renderedLayerIds = new Set<string>();

  // Ana Çözüm Bölümleri ve Yerinde (Inline) Türetimler
  const sections = document.sections || [];
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    if (!section) continue;
    docLines.push(`\\section{${escapeLaTeXText(cleanSectionTitle(section.title || ''))}}`);
    docLines.push('');

    const blocks = section.blocks || [];
    for (const block of blocks) {
      if (!block) continue;
      try {
        const rendered = renderBlockToLaTeX(block, includeDiagrams);
        if (rendered && rendered.trim()) {
          docLines.push(rendered);
          docLines.push('');
        }

        // Yerinde türetim katmanları (inlineExpansions = true ise)
        if (inlineExpansions) {
          const targetLayers = layersByTargetId[block.id] || [];
          for (const layer of targetLayers) {
            const layerLatex = renderLayerToLaTeX(
              layer,
              includeDiagrams,
              layersByTargetId,
              renderedLayerIds
            );
            if (layerLatex.trim()) {
              docLines.push(layerLatex);
              docLines.push('');
            }
          }
        }
      } catch (err) {
        console.warn('LaTeX blok render hatası:', err);
      }
    }

    // Bölüm seviyesindeki yerinde türetimler
    if (inlineExpansions) {
      const sectionLayers = layersByTargetId[section.id] || [];
      for (const layer of sectionLayers) {
        const layerLatex = renderLayerToLaTeX(
          layer,
          includeDiagrams,
          layersByTargetId,
          renderedLayerIds
        );
        if (layerLatex.trim()) {
          docLines.push(layerLatex);
          docLines.push('');
        }
      }
    }
  }

  // Genel Kapsamda Açılan Yerinde Türetimler (Varsa)
  if (inlineExpansions) {
    const rootLayers = [
      ...(layersByTargetId['root'] || []),
      ...(layersByTargetId['general'] || [])
    ].filter((l) => !renderedLayerIds.has(l.id));

    for (const layer of rootLayers) {
      const layerLatex = renderLayerToLaTeX(
        layer,
        includeDiagrams,
        layersByTargetId,
        renderedLayerIds
      );
      if (layerLatex.trim()) {
        docLines.push(layerLatex);
        docLines.push('');
      }
    }
  } else if (includeAppendix && safeLayers.length > 0) {
    // Eski ayrık Ek A desteği
    docLines.push('\\appendix');
    docLines.push(translate("\\section{Analitik Türetimler ve Kurucu Doğa Yasaları}"));
    docLines.push(
      translate("\\noindent Bu ek bölümünde, ana çözümdeki denklemlerin ilk ilkelerden yapılan türetimleri, geometrik dayanakları ve ulaşılan aksiyomatik doğa yasaları yer almaktadır.")
    );
    docLines.push('');

    for (let lIdx = 0; lIdx < safeLayers.length; lIdx++) {
      const layer = safeLayers[lIdx];
      if (!layer) continue;
      const targetRef =
        layer.targetDisplayNumber !== undefined
          ? translate("(Denklem~\\ref{eq:{0}})", [layer.targetDisplayNumber])
          : layer.contextualQuery
          ? translate("(Bağlamsal Soru: \"{0}\")", [escapeLaTeXText(layer.contextualQuery)])
          : '';

      docLines.push(
        `\\subsection{${escapeLaTeXText(layer.title || '')} ${targetRef}}`
      );

      if (layer.isAxiomatic) {
        const axiomTitle =
          layer.axiomType === 'mathematics'
            ? translate("Aksiyomatik Düzey (Formel Matematik / Geometrik Postulat)")
            : translate("Kurucu Doğa Yasası (Fiziksel Aksiyom)");
        docLines.push(
          `\\begin{tcolorbox}[colback=green!5!white, colframe=green!50!black, title={\\textbf{${axiomTitle}}}]`
        );
        docLines.push(
          layer.axiomType === 'mathematics'
            ? translate("Bu ilke, Öklid geometrisinin kurucu aksiyomudur. Düzlem uzay kabulleri altında mantıksal olarak daha ilksel bir ilkeden türetilemez; tüm geometrik teoremler bu aksiyomatik temel üzerine kuruludur.")
            : translate("Bu ilke, klasik mekaniğin deney ve gözlemle doğrulanmış kurucu doğa yasasıdır. Matematiksel olarak daha ilksel bir ilkeden türetilemez.")
        );
        docLines.push('\\end{tcolorbox}');
        docLines.push('');
      } else if (layer.targetDisplayNumber !== undefined) {
        docLines.push(
          translate("\\noindent \\textbf{Türetilen Kaynak Denklem:} Denklem~\\ref{eq:{0}} \\quad \\textbf{Katman Derinliği:} {1}", [layer.targetDisplayNumber, layer.depth])
        );
        docLines.push('');
      }

      const layerBlocks = layer.blocks || [];
      for (const block of layerBlocks) {
        if (!block) continue;
        try {
          const rendered = renderBlockToLaTeX(block, includeDiagrams);
          if (rendered && rendered.trim()) {
            docLines.push(rendered);
            docLines.push('');
          }
        } catch (err) {
          console.warn('LaTeX katman blok render hatası:', err);
        }
      }
    }
  }

  return docLines;
}

/**
 * Tekil SolutionDocument nesnesini bağımsız, tam derlenebilir bir LaTeX (pdflatex / xelatex)
 * kaynak koduna dönüştürür.
 */
export function exportToLaTeX(
  document: SolutionDocument,
  layers: ExpansionLayer[] = [],
  options: LaTeXExportOptions = {}
): string {
  const preamble = getLaTeXPreamble();
  const body = renderProblemBodyToLaTeX(document, layers, options);

  return [
    ...preamble,
    '',
    '\\begin{document}',
    '',
    ...body,
    '',
    '\\end{document}'
  ].join('\n');
}

/**
 * Birden fazla SolutionDocument nesnesini arka arkaya tek bir derlenebilir
 * LaTeX dokümanında birleştirir (Merge Export).
 * Her soru \\clearpage ile yeni sayfadan başlar ve ayrıntılı içindekiler sunulur.
 */
export function exportMultipleToLaTeX(
  items: Array<{ document: SolutionDocument; layers?: ExpansionLayer[]; maxDepth?: number }>,
  options: MultipleLaTeXExportOptions = {}
): string {
  if (!items || items.length === 0) return '';
  if (items.length === 1) {
    return exportToLaTeX(items[0].document, items[0].layers || [], options);
  }

  const {
    author = translate("KATMANDU Bilimsel Çıkarım Sistemi"),
    bundleTitle,
    includeTableOfContents = true
  } = options;
  const docLines: string[] = [];

  // 1. Preamble
  docLines.push(...getLaTeXPreamble());
  docLines.push('');
  docLines.push('\\begin{document}');
  docLines.push('');

  // 2. Birleştirilmiş Rapor Başlığı & Künye
  const dateObj = new Date();
  const safeDate = escapeLaTeXText(
    dateObj.toLocaleDateString(getLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  );

  const mainTitle = bundleTitle
    ? escapeLaTeXText(bundleTitle)
    : translate("KATMANDU Bilimsel Çözüm Raporu");

  docLines.push('\\begin{center}');
  docLines.push(`  {\\huge \\textbf{${mainTitle}}} \\\\[0.4em]`);
  docLines.push(
    translate("  {\\large \\textbf{Birleştirilmiş Problem Çözüm Dizisi ({0} Problem)}} \\\\[0.5em]", [items.length])
  );
  docLines.push(
    translate("  {\\footnotesize \\textbf{Sistem:} {0} \\quad $\\bullet$ \\quad \\textbf{Tarih:} {1}} \\\\[0.3em]", [escapeLaTeXText(author), safeDate])
  );
  docLines.push('  \\rule{\\textwidth}{1.2pt}');
  docLines.push('\\end{center}');
  docLines.push('\\vspace{0.8em}');
  docLines.push('');

  // 3. Problem Listesi / İçindekiler
  if (includeTableOfContents) {
    docLines.push('\\tableofcontents');
    docLines.push('\\vspace{1em}');
    docLines.push(translate("\\noindent\\textbf{\\large Problem Listesi ve Katman Özeti:}\\\\[0.4em]"));
    docLines.push('\\begin{enumerate}\\setlength{\\itemsep}{3pt}');
    items.forEach((item, idx) => {
      const title = escapeLaTeXText(item.document.problemTitle || `Problem ${idx + 1}`);
      const eqCount = item.document.totalEquations || 0;
      const layerCount = (item.layers || []).length;
      docLines.push(
        translate("  \\item \\textbf{{0}} \\quad {\\small\\textit{({1} Denklem, {2} Türetim Katmanı)}}", [title, eqCount, layerCount])
      );
    });
    docLines.push('\\end{enumerate}');
    docLines.push('\\vspace{1.5em}');
    docLines.push('');
  }

  // 4. Her Bir Problemin Gövdesi
  items.forEach((item, idx) => {
    docLines.push('\\clearpage');
    const bodyLines = renderProblemBodyToLaTeX(
      item.document,
      item.layers || [],
      options,
      idx + 1,
      items.length
    );
    docLines.push(...bodyLines);
    docLines.push('');
  });

  // 5. Kapanış
  docLines.push('\\end{document}');

  return docLines.join('\n');
}
