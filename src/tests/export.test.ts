import { describe, it, expect, vi } from 'vitest';
import {
  exportToLaTeX,
  exportMultipleToLaTeX,
  escapeLaTeXText,
  diagramToTikZ,
  getLayersForExport,
  getMaxTreeDepth
} from '../domain/latexExporter';
import { downloadFile } from '../domain/pdfExporter';
import {
  SolutionDocument,
  ExpansionLayer,
  DerivationTreeNode,
  SimpleDiagramSpec
} from '../domain/types';

describe('LaTeX Exporter — escapeLaTeXText', () => {
  it('metin içindeki LaTeX özel karakterlerini kaçırırken matematik modunu korur', () => {
    const input = 'Kütle m_1 ve m_2 için 10% değişim & hata payı: $F = m \\cdot a$ bağıntısı.';
    const output = escapeLaTeXText(input);

    // Dışarıdaki özel karakterler kaçırılmalı
    expect(output).toContain('m\\_1');
    expect(output).toContain('10\\%');
    expect(output).toContain('\\&');

    // Matematik modundaki $F = m \cdot a$ bozulmamalı
    expect(output).toContain('$F = m \\cdot a$');
  });

  it('Markdown kalın ve eğik stillerini LaTeX komutlarına dönüştürür', () => {
    const input = 'Bu bir **aksiyom** ve *doğa yasası* niteliğindedir. Kod: `F_net = 0`.';
    const output = escapeLaTeXText(input);

    expect(output).toContain('\\textbf{aksiyom}');
    expect(output).toContain('\\textit{doğa yasası}');
    expect(output).toContain('\\texttt{F\\_net = 0}');
  });
});

describe('LaTeX Exporter — diagramToTikZ', () => {
  it('SimpleDiagramSpec öğelerini geçerli TikZ koduna dönüştürür', () => {
    const spec: SimpleDiagramSpec = {
      width: 300,
      height: 200,
      caption: 'Basit Sarkaç Serbest Cisim Diyagramı',
      elements: [
        { type: 'point', x: 150, y: 30, label: 'O' },
        { type: 'line', from: [150, 30], to: [150, 150], style: 'rope', label: 'L' },
        { type: 'mass', id: 'm1', x: 150, y: 150, label: 'm', shape: 'circle' },
        { type: 'vector', from: [150, 150], to: [150, 190], label: 'm\\vec{g}' },
        { type: 'axis', origin: [20, 180], xLength: 80, yLength: 60, xLabel: 'x', yLabel: 'y' }
      ]
    };

    const tikz = diagramToTikZ(spec);

    expect(tikz).toContain('\\begin{figure}');
    expect(tikz).toContain('\\begin{tikzpicture}');
    expect(tikz).toContain('\\node[draw, thick, circle');
    expect(tikz).toContain('\\draw[->, very thick]');
    expect(tikz).toContain('\\caption{Basit Sarkaç Serbest Cisim Diyagramı}');
    expect(tikz).toContain('\\end{tikzpicture}');
    expect(tikz).toContain('\\end{figure}');
  });

  it('Bozuk, eksik koordinatlı veya nesne biçimindeki şema öğelerini çökmeden (fail-soft) işler', () => {
    // Modelden bazen gelen varyasyonlar: from/to eksik veya [x,y] yerine {x,y}
    const malformedSpec = {
      width: 400,
      height: 300,
      elements: [
        null as any,
        { type: 'line' } as any, // from ve to tamamen eksik (undefined)
        { type: 'vector', from: undefined, to: undefined } as any,
        { type: 'axis', origin: undefined } as any,
        { type: 'angle', center: undefined } as any,
        { type: 'pulley', center: undefined } as any,
        { type: 'line', from: { x: 10, y: 20 }, to: { x: 100, y: 120 }, label: 'kablo' } as any, // {x, y} biçimi
        { type: 'mass', x: 50, y: 50, label: 'M' }
      ]
    } as SimpleDiagramSpec;

    // Hata fırlatmamalı, sistemi çökertmemeli
    expect(() => diagramToTikZ(malformedSpec)).not.toThrow();
    const result = diagramToTikZ(malformedSpec);
    expect(result).toContain('\\begin{tikzpicture}');
    expect(result).toContain('(10, 20) -- (100, 120)');
    expect(result).toContain('{$M$}');
  });
});

describe('LaTeX Exporter — exportToLaTeX and Depth Filtering', () => {
  const sampleDocument: SolutionDocument = {
    id: 'doc_pendulum',
    problemId: 'prob_01',
    problemTitle: 'Basit Sarkaç Salınım Periyodu Türetimi',
    problemText: 'Uzunluğu $L$, kütlesi $m$ olan sarkaç için $\\theta(t)$ hareket denklemi.',
    strategy: 'Teğetsel doğrultuda Newton’un 2. hareket yasası uygulanacaktır.',
    assumptions: ['İp kütlesiz ve esnemezdir.', 'Hava sürtünmesi ihmal edilmiştir.'],
    totalEquations: 2,
    sections: [
      {
        id: 'sec_1',
        title: 'Kuvvet Analizi ve Hareket Denklemi',
        blocks: [
          {
            id: 'blk_1',
            kind: 'prose',
            text: 'Teğetsel doğrultudaki net kuvvet yerçekiminin izdüşümüdür:'
          },
          {
            id: 'blk_2',
            kind: 'equation',
            latex: 'F_t = -m g \\sin\\theta',
            explanation: 'Teğetsel net kuvvet',
            displayNumber: 1
          },
          {
            id: 'blk_3',
            kind: 'equation',
            latex: '\\ddot{\\theta} + \\frac{g}{L}\\theta = 0',
            explanation: 'Küçük açılar yaklaşımında hareket denklemi',
            displayNumber: 2
          }
        ]
      }
    ]
  };

  const layer1: ExpansionLayer = {
    id: 'layer_1',
    depth: 1,
    targetBlockId: 'blk_2',
    targetDisplayNumber: 1,
    title: 'Teğetsel Kuvvet ve İzdüşüm Türetimi',
    blocks: [
      {
        id: 'l1_b1',
        kind: 'prose',
        text: 'Polar koordinatlarda radyal ve teğetsel birim vektörler ayrıştırılır.'
      },
      {
        id: 'l1_b2',
        kind: 'equation',
        latex: '\\vec{F}_g = -mg\\sin\\theta\\,\\hat{u}_\\theta - mg\\cos\\theta\\,\\hat{u}_r'
      }
    ],
    isAxiomatic: false,
    isTerminal: false
  };

  const layer2Axiom: ExpansionLayer = {
    id: 'layer_2_newton',
    depth: 2,
    targetBlockId: 'l1_b2',
    targetDisplayNumber: 1,
    title: 'Aksiyom: Newton’un 2. Hareket Yasası',
    blocks: [
      {
        id: 'l2_b1',
        kind: 'prose',
        text: 'Klasik mekaniğin kurucu doğa yasası: Bir cisme etki eden net dış kuvvet momentumun zamana göre türevidir.'
      },
      {
        id: 'l2_b2',
        kind: 'equation',
        latex: '\\vec{F}_{net} = \\frac{d\\vec{p}}{dt} = m\\vec{a}'
      }
    ],
    isAxiomatic: true,
    isTerminal: true,
    axiomType: 'physics'
  };

  const tree: DerivationTreeNode = {
    id: 'root',
    parentId: null,
    label: 'Ana Çözüm',
    depth: 0,
    children: [
      {
        id: 'layer_1',
        parentId: 'root',
        label: 'Teğetsel Kuvvet',
        depth: 1,
        targetDisplayNumber: 1,
        targetBlockId: 'blk_2',
        layer: layer1,
        children: [
          {
            id: 'layer_2_newton',
            parentId: 'layer_1',
            label: 'Newton 2. Yasa',
            depth: 2,
            targetDisplayNumber: 1,
            isAxiomatic: true,
            axiomType: 'physics',
            layer: layer2Axiom,
            children: []
          }
        ]
      }
    ]
  };

  it('Derinlik 0 (Yalnızca Ana Çözüm) seçildiğinde ek bölüm üretilmez', () => {
    const layers = getLayersForExport(tree, 0);
    expect(layers).toHaveLength(0);

    const tex = exportToLaTeX(sampleDocument, layers, { maxDepth: 0 });

    expect(tex).toContain('\\documentclass[12pt,a4paper]{article}');
    expect(tex).toContain('Basit Sarkaç Salınım Periyodu Türetimi');
    expect(tex).toContain('\\label{eq:1}');
    expect(tex).toContain('\\label{eq:2}');
    expect(tex).toContain('F_t = -m g \\sin\\theta');
    expect(tex).not.toContain('\\appendix');
    expect(tex).not.toContain('Ek A: Analitik');
  });

  it('Derinlik 1 seçildiğinde yalnızca 1. katman yerinde (in-place tcolorbox) dahil edilir', () => {
    const layers = getLayersForExport(tree, 1);
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe('layer_1');

    const tex = exportToLaTeX(sampleDocument, layers, { maxDepth: 1 });

    expect(tex).not.toContain('\\appendix');
    expect(tex).toContain('katmandudepth1');
    expect(tex).toContain('Teğetsel Kuvvet ve İzdüşüm Türetimi');
    expect(tex).toContain('(Denklem~\\ref{eq:1} için türetim)');
    expect(tex).not.toContain("Aksiyom: Newton'un 2. Hareket Yasası");
  });

  it('Derinlik 2 (Tüm Ağaç) seçildiğinde aksiyom kutusu ve tüm türetimler yerinde dahil edilir', () => {
    const layers = getLayersForExport(tree, 2);
    expect(layers).toHaveLength(2);

    const tex = exportToLaTeX(sampleDocument, layers, { maxDepth: 2 });

    expect(tex).not.toContain('\\appendix');
    expect(tex).toContain('katmandudepth1');
    expect(tex).toContain('katmandudepth2');
    expect(tex).toContain('Teğetsel Kuvvet ve İzdüşüm Türetimi');
    expect(tex).toContain("Aksiyom: Newton'un 2. Hareket Yasası");
    expect(tex).toContain('Kurucu Doğa Yasası (Fiziksel Aksiyom)');
    expect(tex).toContain('\\vec{F}_{net} = \\frac{d\\vec{p}}{dt} = m\\vec{a}');
  });

  it('İsteğe bağlı olarak inlineExpansions: false verildiğinde ek (appendix) fallback olarak çalışır', () => {
    const layers = getLayersForExport(tree, 2);
    const tex = exportToLaTeX(sampleDocument, layers, { maxDepth: 2, inlineExpansions: false, includeAppendix: true });

    expect(tex).toContain('\\appendix');
    expect(tex).toContain('Analitik Türetimler ve Kurucu Doğa Yasaları');
  });

  it('getMaxTreeDepth ağacın derinliğini doğru hesaplar', () => {
    expect(getMaxTreeDepth(tree)).toBe(2);

    const singleNode: DerivationTreeNode = {
      id: 'root',
      parentId: null,
      label: 'Ana',
      depth: 0,
      children: []
    };
    expect(getMaxTreeDepth(singleNode)).toBe(0);
  });

  it('LaTeX çıktısında başlığın altında AI model künyesi, çözüm tarihi ve sade "PROBLEM" başlığı yer almalıdır', () => {
    const customDoc = {
      ...sampleDocument,
      metadata: {
        providerName: 'Google Gemini',
        modelName: 'gemini-3.6-flash',
        reasoningEffort: 'high',
        solvedAt: 1725573600000
      }
    };

    const tex = exportToLaTeX(customDoc, [], { maxDepth: 0 });

    // 1. AI Model Künyesi ve Tarih
    expect(tex).not.toContain('Çözüm Motoru:');
    expect(tex).toContain('gemini-3.6-flash');
    expect(tex).not.toContain('Akıl Yürütme:');
    expect(tex).toContain('Tarih:');

    // 2. PROBLEM başlığı (eski "Problem İfadesi ve Kurulum" yerine)
    expect(tex).toContain('\\noindent\\textbf{\\large PROBLEM}');
    expect(tex).not.toContain('Problem İfadesi ve Kurulum');

    // 3. breakable tcolorbox
    expect(tex).toContain('\\tcbuselibrary{breakable}');
    expect(tex).toContain('breakable');

    // 4. Çözümün ilk sayfadan başlamasını sağlayan doğrudan bölümleme
    expect(tex).toContain('\\section{Kuvvet Analizi ve Hareket Denklemi}');
    expect(tex).not.toContain('\\section{Analitik Çözüm Adımları}');
  });
});

describe('PDF & File Exporter — downloadFile', () => {
  it('downloadFile tarayıcı indirme bağlantısını doğru oluşturur ve tetikler', () => {
    const clickSpy = vi.fn();
    const fakeAnchor = {
      href: '',
      download: '',
      click: clickSpy
    };
    const appendSpy = vi.fn();
    const removeSpy = vi.fn();

    const fakeDocument = {
      createElement: vi.fn().mockReturnValue(fakeAnchor),
      body: {
        appendChild: appendSpy,
        removeChild: removeSpy
      }
    };
    const fakeUrl = {
      createObjectURL: vi.fn().mockReturnValue('blob:test_url'),
      revokeObjectURL: vi.fn()
    };

    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('URL', fakeUrl);

    downloadFile('test content', 'katmandu_test.tex', 'application/x-tex');

    expect(fakeDocument.createElement).toHaveBeenCalledWith('a');
    expect(fakeAnchor.download).toBe('katmandu_test.tex');
    expect(clickSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledWith(fakeAnchor);
    expect(removeSpy).toHaveBeenCalledWith(fakeAnchor);
    expect(fakeUrl.revokeObjectURL).toHaveBeenCalledWith('blob:test_url');

    vi.unstubAllGlobals();
  });

  it('Can generate and dump full LaTeX for pendulum fixture', async () => {
    const fs = await import('fs');
    const { MockProvider } = await import('../providers/mockProvider');
    const { TrustedAssembler } = await import('../domain/trustedAssembler');

    const raw = MockProvider.getPendulumFixture();
    const doc = TrustedAssembler.assembleSolution(
      { id: 'p1', text: 'Sarkaç', createdAt: 0 },
      raw
    );
    const tex = exportToLaTeX(doc);
    fs.writeFileSync('/tmp/pendulum.tex', tex, 'utf-8');
    expect(tex).toBeDefined();

    const wedgeRaw = MockProvider.getMovingWedgeFixture();
    const wedgeDoc = TrustedAssembler.assembleSolution(
      { id: 'p2', text: 'Eğik Düzlem', createdAt: 0 },
      wedgeRaw
    );
    const wedgeTex = exportToLaTeX(wedgeDoc);
    fs.writeFileSync('/tmp/wedge.tex', wedgeTex, 'utf-8');
    expect(wedgeTex).toBeDefined();
  });
});

describe('LaTeX Exporter — exportMultipleToLaTeX (Çoklu Soru Birleştirme)', () => {
  it('boş problem listesi verildiğinde boş string döner', () => {
    const output = exportMultipleToLaTeX([]);
    expect(output).toBe('');
  });

  it('birden fazla problemi tek bir LaTeX belgesinde \\clearpage ile birleştirir', async () => {
    const { MockProvider } = await import('../providers/mockProvider');
    const { TrustedAssembler } = await import('../domain/trustedAssembler');

    const raw1 = MockProvider.getPendulumFixture();
    const doc1 = TrustedAssembler.assembleSolution(
      { id: 'p1', text: 'Basit Sarkaç', createdAt: 0 },
      raw1
    );

    const raw2 = MockProvider.getMovingWedgeFixture();
    const doc2 = TrustedAssembler.assembleSolution(
      { id: 'p2', text: 'Hareketli Eğik Düzlem', createdAt: 0 },
      raw2
    );

    const mergedTex = exportMultipleToLaTeX(
      [
        { document: doc1, layers: [] },
        { document: doc2, layers: [] }
      ],
      {
        bundleTitle: 'Fizik 101 Soru Seti',
        includeTableOfContents: true
      }
    );

    // Belge başlangıcı ve sonu tek olmalıdır
    expect(mergedTex).toContain('\\documentclass[12pt,a4paper]{article}');
    expect(mergedTex.match(/\\begin\{document\}/g)?.length).toBe(1);
    expect(mergedTex.match(/\\end\{document\}/g)?.length).toBe(1);

    // Başlık ve İçindekiler
    expect(mergedTex).toContain('Fizik 101 Soru Seti');
    expect(mergedTex).toContain('\\tableofcontents');

    // Problemler arası sayfa sonu
    expect(mergedTex).toContain('\\clearpage');

    // Her iki problem de doğru numaralandırılmış ve etiketlenmiş olmalı
    expect(mergedTex).toContain('Problem 1/2:');
    expect(mergedTex).toContain('Problem 2/2:');
    expect(mergedTex).toContain('PROBLEM 1 / 2');
    expect(mergedTex).toContain('PROBLEM 2 / 2');

    // İçerik kontrolleri
    expect(mergedTex).toContain('Basit Sarka');
    expect(mergedTex).toContain('Hareketli');
  });

  it('includeTableOfContents: false olduğunda içindekiler tablosunu dahil etmez', async () => {
    const { MockProvider } = await import('../providers/mockProvider');
    const { TrustedAssembler } = await import('../domain/trustedAssembler');

    const raw1 = MockProvider.getPendulumFixture();
    const doc1 = TrustedAssembler.assembleSolution(
      { id: 'p1', text: 'Soru 1', createdAt: 0 },
      raw1
    );

    const mergedTex = exportMultipleToLaTeX(
      [{ document: doc1, layers: [] }],
      { includeTableOfContents: false }
    );

    expect(mergedTex).not.toContain('\\tableofcontents');
  });

  it('yerinde (inline) türetim katmanlarını seçilen problem altında korur', async () => {
    const { MockProvider } = await import('../providers/mockProvider');
    const { TrustedAssembler } = await import('../domain/trustedAssembler');

    const raw1 = MockProvider.getPendulumFixture();
    const doc1 = TrustedAssembler.assembleSolution(
      { id: 'p1', text: 'Soru 1', createdAt: 0 },
      raw1
    );

    const testLayer: ExpansionLayer = {
      id: 'layer_pendulum_sub',
      targetBlockId: doc1.sections[0]?.blocks[0]?.id || 'b1',
      targetDisplayNumber: 1,
      depth: 1,
      title: 'Euler-Lagrange İspat Adımı',
      isAxiomatic: false,
      isTerminal: false,
      blocks: [
        {
          id: 'b_sub_1',
          kind: 'equation',
          latex: '\\frac{d}{dt}\\left(\\frac{\\partial L}{\\partial \\dot{\\theta}}\\right) - \\frac{\\partial L}{\\partial \\theta} = 0',
          displayNumber: 1
        }
      ]
    };

    const mergedTex = exportMultipleToLaTeX([
      { document: doc1, layers: [testLayer] }
    ]);

    expect(mergedTex).toContain('Euler-Lagrange');
    expect(mergedTex).toContain('\\partial L');
  });
});

describe('LaTeX Exporter — Derleme Hatalarına Karşı Güvenlik Kalkanı', () => {
  it('Preamble babel shorthands=off, iftex, cancel, bm ve fizik makrolarını içerir', () => {
    const doc: SolutionDocument = {
      id: 'd_safe',
      problemId: 'p_safe',
      problemTitle: 'Test Dokümanı',
      problemText: 'Problem metni',
      strategy: '',
      assumptions: [],
      totalEquations: 0,
      sections: []
    };
    const tex = exportToLaTeX(doc);

    expect(tex).toContain('\\usepackage{iftex}');
    expect(tex).toContain('\\usepackage[shorthands=off,turkish]{babel}');
    expect(tex).toContain('\\usepackage{cancel}');
    expect(tex).toContain('\\usepackage{bm}');
    expect(tex).toContain('\\providecommand{\\dd}');
    expect(tex).toContain('\\providecommand{\\pdv}');
    expect(tex).toContain('\\providecommand{\\dv}');
    expect(tex).toContain('\\providecommand{\\abs}');
    expect(tex).toContain('\\providecommand{\\norm}');
  });

  it('Genişletilmiş Unicode karakterleri (×, ±, °, →, ², vb.) tanımlar', () => {
    const doc: SolutionDocument = {
      id: 'd_uni',
      problemId: 'p_uni',
      problemTitle: 'Unicode Testi',
      problemText: 'Metin',
      strategy: '',
      assumptions: [],
      totalEquations: 0,
      sections: []
    };
    const tex = exportToLaTeX(doc);

    expect(tex).toContain('\\DeclareUnicodeCharacter{00D7}{\\ensuremath{\\times}}');
    expect(tex).toContain('\\DeclareUnicodeCharacter{00B1}{\\ensuremath{\\pm}}');
    expect(tex).toContain('\\DeclareUnicodeCharacter{00B0}{\\ensuremath{^\\circ}}');
    expect(tex).toContain('\\DeclareUnicodeCharacter{2192}{\\ensuremath{\\to}}');
    expect(tex).toContain('\\DeclareUnicodeCharacter{00B2}{\\ensuremath{^2}}');
    expect(tex).toContain('\\DeclareUnicodeCharacter{221E}{\\ensuremath{\\infty}}');
  });

  it('Modelden gelen \\begin{align} ve \\begin{equation} bloklarını güvenle normalize eder', () => {
    const doc: SolutionDocument = {
      id: 'd_norm',
      problemId: 'p_norm',
      problemTitle: 'Ortam Normalizasyonu',
      problemText: 'Metin',
      strategy: '',
      assumptions: [],
      totalEquations: 3,
      sections: [
        {
          id: 's1',
          title: 'Bölüm 1',
          blocks: [
            {
              id: 'b1',
              kind: 'equation',
              latex: '\\begin{align} a &= b \\\\ c &= d \\end{align}',
              displayNumber: 1
            },
            {
              id: 'b2',
              kind: 'equation',
              latex: '\\[ x = y + z \\]'
            },
            {
              id: 'b3',
              kind: 'equation',
              latex: '\\begin{equation} F = ma \\end{equation}',
              displayNumber: 2
            }
          ]
        }
      ]
    };
    const tex = exportToLaTeX(doc);

    // equation içine doğrudan align konulmamalı (erroneous nesting önlenmeli)
    expect(tex).not.toContain('\\begin{equation}\n  \\label{eq:1}\n  \\begin{align}');
    expect(tex).toContain('\\begin{aligned}');
    expect(tex).toContain('\\end{aligned}');

    // \\[ ... \\] iç içe konulmamalı
    expect(tex).not.toContain('\\[\n  \\[');

    // equation içine doğrudan equation konulmamalı
    expect(tex).not.toContain('\\begin{equation}\n  \\label{eq:2}\n  \\begin{equation}');
  });

  it('Derinliği > 1 olan iç içe katmanlarda ve aksiyom kutularında unbreakable kullanır', () => {
    const doc: SolutionDocument = {
      id: 'd_nest',
      problemId: 'p_nest',
      problemTitle: 'Katman Testi',
      problemText: 'Metin',
      strategy: '',
      assumptions: [],
      totalEquations: 1,
      sections: [
        {
          id: 's1',
          title: 'Bölüm 1',
          blocks: [
            {
              id: 'eq1',
              kind: 'equation',
              latex: 'E = mc^2',
              displayNumber: 1
            }
          ]
        }
      ]
    };

    const layerDepth1: ExpansionLayer = {
      id: 'l1',
      targetBlockId: 'eq1',
      targetDisplayNumber: 1,
      depth: 1,
      title: 'Kütle Enerji Eşdeğerliği',
      blocks: [
        {
          id: 'b_l1',
          kind: 'equation',
          latex: 'p = \\gamma m v',
          displayNumber: 11
        }
      ],
      isAxiomatic: false,
      isTerminal: false
    };

    const layerDepth2: ExpansionLayer = {
      id: 'l2',
      targetBlockId: 'b_l1',
      targetDisplayNumber: 11,
      depth: 2,
      title: 'Lorentz Faktörü Türetimi',
      blocks: [
        {
          id: 'b_l2',
          kind: 'prose',
          text: 'Özel görelilik ilkesi gereğince...'
        }
      ],
      isAxiomatic: true,
      axiomType: 'physics',
      isTerminal: true
    };

    const tex = exportToLaTeX(doc, [layerDepth1, layerDepth2]);

    // Katman 1 (dış): breakable olmalı
    expect(tex).toContain('Katman Derinliği 1: Kütle Enerji Eşdeğerliği');
    // Katman 2 (iç): unbreakable olmalı (tcolorbox nested breakable hatasını önler)
    expect(tex).toContain('title={\\textbf{Katman Derinliği 2: Lorentz Faktörü Türetimi (Denklem~\\ref{eq:11} için türetim)}}, unbreakable');
    // Aksiyom kutusu unbreakable olmalı
    expect(tex).toContain('title={\\textbf{Kurucu Doğa Yasası (Fiziksel Aksiyom)}}, unbreakable');
  });

  it('Metin modunda unutulan çıplak matematik komutlarını ve özel karakterleri güvenle kaçırır', () => {
    const raw = 'Burada \\theta açısı ve \\omega frekansı önemlidir. Ayrıca 10^5 değeri ve ~ yaklaşık işareti.';
    const escaped = escapeLaTeXText(raw);

    expect(escaped).toContain('$\\theta$');
    expect(escaped).toContain('$\\omega$');
    expect(escaped).toContain('\\textasciicircum{}');
    expect(escaped).toContain('\\textasciitilde{}');
  });
});
