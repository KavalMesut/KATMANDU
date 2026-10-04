import { translate } from '../i18n';
import React, { useState } from 'react';
import { SimpleDiagramSpec, DiagramElement } from '../domain/types';
import { KaTeXRenderer } from './KaTeXRenderer';
import { Compass, ZoomIn, ZoomOut, Maximize2, Minimize2 } from 'lucide-react';

interface SimpleDiagramProps {
  spec?: SimpleDiagramSpec | null;
  className?: string;
}

/**
 * Güvenli koordinat ayrıştırıcı:
 * [x, y] dizisi veya {x, y} nesnesi gelebilir; model çıktısındaki varyasyonları güvenle normalize eder.
 */
function toCoords(val: unknown): [number, number] | null {
  if (!val) return null;
  if (Array.isArray(val) && val.length >= 2) {
    const x = Number(val[0]);
    const y = Number(val[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    const x = Number(obj.x ?? obj.x1);
    const y = Number(obj.y ?? obj.y1);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  return null;
}

/**
 * LaTeX / Sembolik Metinleri SVG için Şık Matematik Unicode Karakterlerine Dönüştürücü.
 * Geriye dönük uyumluluk ve SVG saf text desteği için korunmaktadır.
 */
export function formatDiagramLabel(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let text = String(raw).trim();
  if (!text) return '';

  text = text.replace(/\\\\/g, '\\');

  const greekReplacements: [RegExp, string][] = [
    [/\\?theta\b/gi, 'θ'],
    [/\\?alpha\b/gi, 'α'],
    [/\\?beta\b/gi, 'β'],
    [/\\?gamma\b/gi, 'γ'],
    [/\\?phi\b/gi, 'φ'],
    [/\\?omega\b/gi, 'ω'],
    [/\\?lambda\b/gi, 'λ'],
    [/\\?delta\b/g, 'δ'],
    [/\\?Delta\b/g, 'Δ'],
    [/\\?sigma\b/gi, 'σ'],
    [/\\?tau\b/gi, 'τ'],
    [/\\?pi\b/gi, 'π'],
    [/\\?mu\b/gi, 'μ'],
    [/\\?nu\b/gi, 'ν'],
    [/\\?rho\b/gi, 'ρ'],
    [/\\?psi\b/gi, 'ψ'],
    [/\\?chi\b/gi, 'χ'],
    [/\\?eta\b/gi, 'η'],
    [/\\?zeta\b/gi, 'ζ'],
    [/\\?epsilon\b/gi, 'ε']
  ];

  for (const [re, sym] of greekReplacements) {
    text = text.replace(re, sym);
  }

  text = text.replace(/\\vec\{([a-zA-Z0-9]+)\}/g, '$1⃗');
  text = text.replace(/\\vec\s*([a-zA-Z])/g, '$1⃗');
  text = text.replace(/\\dot\{([a-zA-Z0-9θαβφωλ]+)\}/g, '$1̇');
  text = text.replace(/\\ddot\{([a-zA-Z0-9θαβφωλ]+)\}/g, '$1̈');
  text = text.replace(/\\hat\{([a-zA-Z0-9]+)\}/g, '$1̂');

  text = text.replace(/\\?(sin|cos|tan)\b/g, ' $1 ');
  text = text.replace(/\\sqrt/g, '√');
  text = text.replace(/\\cdot/g, '·');
  text = text.replace(/\\times/g, '×');
  text = text.replace(/\\approx/g, '≈');
  text = text.replace(/\\partial/g, '∂');
  text = text.replace(/\\infty/g, '∞');
  text = text.replace(/\\pm/g, '±');

  text = text.replace(/_\{?0\}?/g, '₀');
  text = text.replace(/_\{?1\}?/g, '₁');
  text = text.replace(/_\{?2\}?/g, '₂');
  text = text.replace(/_\{?t\}?/gi, 'ₜ');
  text = text.replace(/_\{?r\}?/gi, 'ᵣ');
  text = text.replace(/_\{?net\}?/gi, 'ₙₑₜ');
  text = text.replace(/_\{?L\}?/g, 'ₗ');
  text = text.replace(/_\{?s\}?/g, 'ₛ');
  text = text.replace(/\^\{?2\}?/g, '²');
  text = text.replace(/\^\{?3\}?/g, '³');

  text = text.replace(/[{}]/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * DiagramLabel:
 * SVG içinde gerçek matematik formüllerini KaTeX ile render eden şık etiket bileşeni.
 */
const DiagramLabel: React.FC<{
  label: string;
  x: number;
  y: number;
  color?: string;
  className?: string;
}> = ({ label, x, y, color, className = '' }) => {
  const content = label.startsWith('$') ? label : `$${label}$`;

  return (
    <foreignObject
      x={x - 60}
      y={y - 14}
      width={120}
      height={30}
      className="overflow-visible pointer-events-none"
    >
      <div
        className={`flex items-center justify-center text-[12px] font-serif leading-none select-none ${className}`}
        style={color ? { color } : undefined}
      >
        <KaTeXRenderer content={content} />
      </div>
    </foreignObject>
  );
};

/**
 * SimpleDiagram:
 * Akademik ders kitabı ve IEEE makalesi kalitesinde vektörel fizik ve devre şematik motoru.
 * - Mühendislik milimetrik ızgara arka planı
 * - Devre elemanları (Direnç, Yük Direnci R_L, Kaynak, Toprak, Kapasitör)
 * - Mekanik elemanlar (3D Gölgeli Kütleler, Yay, Makara, Eğimli Yüzey, Vektörler, Açı Dilimleri)
 * - KaTeX matematiksel etiket render'ı
 * - Büyütme/Küçültme (Zoom) ve Tam Ekran (Fullscreen) inceleme modu
 */
export const SimpleDiagram: React.FC<SimpleDiagramProps> = ({ spec, className = '' }) => {
  const [zoom, setZoom] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  if (!spec || typeof spec !== 'object') {
    return null;
  }

  const elements = Array.isArray(spec.elements) ? spec.elements : [];
  if (elements.length === 0) {
    return null;
  }

  const width = Number(spec.width) || 360;
  const height = Number(spec.height) || 240;
  const caption = typeof spec.caption === 'string' ? spec.caption : undefined;

  const renderElement = (el: DiagramElement, index: number): React.ReactNode => {
    if (!el || typeof el !== 'object') return null;

    try {
      switch (el.type) {
        // --- DEVRE ELEMANLARI ---
        case 'resistor': {
          const p1 = toCoords(el.from);
          const p2 = toCoords(el.to);
          if (!p1 || !p2) return null;
          const [x1, y1] = p1;
          const [x2, y2] = p2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const color = el.color || '#b45309'; // Amber/kahve
          const lead = Math.max(14, (len - 50) / 2);
          const bodyLen = len - 2 * lead;
          const teeth = 6;
          const toothW = bodyLen / teeth;

          let d = `M 0 0 L ${lead} 0 `;
          for (let i = 0; i < teeth; i++) {
            const tx1 = lead + (i + 0.25) * toothW;
            const ty1 = i % 2 === 0 ? -9 : 9;
            const tx2 = lead + (i + 0.75) * toothW;
            const ty2 = i % 2 === 0 ? 9 : -9;
            d += `L ${tx1} ${ty1} L ${tx2} ${ty2} `;
          }
          d += `L ${len - lead} 0 L ${len} 0`;

          return (
            <g key={`res-${index}`} transform={`translate(${x1}, ${y1}) rotate(${angle})`}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#component-shadow)"
              />
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={len / 2}
                  y={-18}
                  color={color}
                  className="font-bold text-amber-800 dark:text-amber-300"
                />
              )}
            </g>
          );
        }

        case 'source': {
          const p = toCoords(el.center);
          if (!p) return null;
          const [cx, cy] = p;
          const color = el.color || '#2563eb';
          const isAc = el.kind === 'ac';

          return (
            <g key={`src-${index}`} transform={`translate(${cx}, ${cy})`}>
              <circle
                cx={0}
                cy={0}
                r={18}
                fill="url(#source-gradient)"
                stroke={color}
                strokeWidth="2"
                filter="url(#component-shadow)"
              />
              {isAc ? (
                <path d="M -8 0 Q -4 -8 0 0 T 8 0" fill="none" stroke={color} strokeWidth="2" />
              ) : (
                <>
                  <text x={0} y={-4} textAnchor="middle" fontSize="13" fontWeight="bold" fill={color}>
                    +
                  </text>
                  <text x={0} y={12} textAnchor="middle" fontSize="15" fontWeight="bold" fill={color}>
                    −
                  </text>
                </>
              )}
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={0}
                  y={-28}
                  color={color}
                  className="font-bold text-blue-800 dark:text-blue-300"
                />
              )}
            </g>
          );
        }

        case 'ground': {
          const p = toCoords(el.at);
          if (!p) return null;
          const [x, y] = p;

          return (
            <g key={`gnd-${index}`}>
              <line x1={x} y1={y} x2={x} y2={y + 12} stroke="#57534e" strokeWidth="2" className="stroke-stone-600 dark:stroke-stone-300" />
              <line x1={x - 14} y1={y + 12} x2={x + 14} y2={y + 12} stroke="#57534e" strokeWidth="2" className="stroke-stone-600 dark:stroke-stone-300" />
              <line x1={x - 9} y1={y + 16} x2={x + 9} y2={y + 16} stroke="#57534e" strokeWidth="1.75" className="stroke-stone-600 dark:stroke-stone-300" />
              <line x1={x - 4} y1={y + 20} x2={x + 4} y2={y + 20} stroke="#57534e" strokeWidth="1.5" className="stroke-stone-600 dark:stroke-stone-300" />
              {el.label && (
                <text x={x + 18} y={y + 16} fontSize="10" fontFamily="sans-serif" className="fill-stone-500">
                  {el.label}
                </text>
              )}
            </g>
          );
        }

        case 'capacitor': {
          const p1 = toCoords(el.from);
          const p2 = toCoords(el.to);
          if (!p1 || !p2) return null;
          const [x1, y1] = p1;
          const [x2, y2] = p2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const color = el.color || '#0284c7';
          const gap = 8;
          const mid = len / 2;
          const plateH = 16;

          return (
            <g key={`cap-${index}`} transform={`translate(${x1}, ${y1}) rotate(${angle})`}>
              <line x1={0} y1={0} x2={mid - gap / 2} y2={0} stroke={color} strokeWidth="2" />
              <line x1={mid - gap / 2} y1={-plateH} x2={mid - gap / 2} y2={plateH} stroke={color} strokeWidth="2.5" />
              <line x1={mid + gap / 2} y1={-plateH} x2={mid + gap / 2} y2={plateH} stroke={color} strokeWidth="2.5" />
              <line x1={mid + gap / 2} y1={0} x2={len} y2={0} stroke={color} strokeWidth="2" />
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={mid}
                  y={-plateH - 10}
                  color={color}
                  className="font-bold text-sky-800 dark:text-sky-300"
                />
              )}
            </g>
          );
        }

        // --- MEKANİK ELEMANLAR ---
        case 'spring': {
          const p1 = toCoords(el.from);
          const p2 = toCoords(el.to);
          if (!p1 || !p2) return null;
          const [x1, y1] = p1;
          const [x2, y2] = p2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const color = el.color || '#ea580c';
          const coils = Number(el.coils) || 7;
          const lead = Math.max(12, (len - 60) / 2);
          const springLen = len - 2 * lead;
          const step = springLen / coils;

          let d = `M 0 0 L ${lead} 0 `;
          for (let i = 0; i < coils; i++) {
            const cx1 = lead + (i + 0.25) * step;
            const cy1 = -9;
            const cx2 = lead + (i + 0.75) * step;
            const cy2 = 9;
            d += `L ${cx1} ${cy1} L ${cx2} ${cy2} `;
          }
          d += `L ${len - lead} 0 L ${len} 0`;

          return (
            <g key={`spring-${index}`} transform={`translate(${x1}, ${y1}) rotate(${angle})`}>
              <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={len / 2}
                  y={-18}
                  color={color}
                  className="font-bold text-orange-800 dark:text-orange-300"
                />
              )}
            </g>
          );
        }

        case 'pulley': {
          const p = toCoords(el.center);
          if (!p) return null;
          const [cx, cy] = p;
          const r = Number(el.radius) || 20;
          const color = el.color || '#64748b';

          return (
            <g key={`pulley-${index}`} transform={`translate(${cx}, ${cy})`}>
              <circle cx={0} cy={0} r={r} fill="#e2e8f0" stroke={color} strokeWidth="2.5" className="fill-stone-200 dark:fill-stone-700" />
              <circle cx={0} cy={0} r={r - 4} fill="none" stroke={color} strokeWidth="1" strokeDasharray="3,3" />
              <circle cx={0} cy={0} r={4} fill="#0f172a" className="fill-stone-900 dark:fill-stone-100" />
              {el.label && <DiagramLabel label={el.label} x={0} y={r + 14} className="text-stone-600 dark:text-stone-400" />}
            </g>
          );
        }

        case 'surface': {
          const p1 = toCoords(el.from);
          const p2 = toCoords(el.to);
          if (!p1 || !p2) return null;

          const [x1, y1] = p1;
          const [x2, y2] = p2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const steps = Math.min(60, Math.max(1, Math.floor(length / 8)));
          const ticks: React.ReactNode[] = [];
          const perpY = el.side === 'top' ? -6 : 6;

          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = x1 + dx * t;
            const py = y1 + dy * t;
            ticks.push(
              <line
                key={`tick-${index}-${i}`}
                x1={px}
                y1={py}
                x2={px - 5}
                y2={py + perpY}
                stroke="#78716c"
                strokeWidth="1.25"
                className="stroke-stone-400 dark:stroke-stone-500"
              />
            );
          }

          return (
            <g key={`surf-${index}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#44403c"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="stroke-stone-800 dark:stroke-stone-200"
              />
              {ticks}
            </g>
          );
        }

        case 'line': {
          const p1 = toCoords(el.from);
          const p2 = toCoords(el.to);
          if (!p1 || !p2) return null;

          const [x1, y1] = p1;
          const [x2, y2] = p2;
          const isDashed = el.style === 'dashed';
          const isRope = el.style === 'rope';
          const strokeColor = typeof el.color === 'string' ? el.color : undefined;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <g key={`line-${index}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={strokeColor || '#57534e'}
                strokeWidth={isRope ? '2.25' : '1.5'}
                strokeDasharray={isDashed ? '4,4' : undefined}
                className={
                  strokeColor
                    ? ''
                    : isRope
                    ? 'stroke-stone-900 dark:stroke-stone-200'
                    : 'stroke-stone-600 dark:stroke-stone-400'
                }
              />
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={midX + 12}
                  y={midY}
                  color={strokeColor}
                  className="font-serif italic text-stone-900 dark:text-stone-200"
                />
              )}
            </g>
          );
        }

        case 'axis': {
          const pOrigin = toCoords(el.origin);
          if (!pOrigin) return null;
          const [ox, oy] = pOrigin;
          const xLen = Number(el.xLength) || 150;
          const yLen = Number(el.yLength) || 100;

          return (
            <g key={`axis-${index}`}>
              <line
                x1={ox}
                y1={oy}
                x2={ox + xLen}
                y2={oy}
                stroke="#78716c"
                strokeWidth="1.5"
                markerEnd="url(#arrow-axis)"
                className="stroke-stone-500 dark:stroke-stone-400"
              />
              {el.xLabel && (
                <DiagramLabel
                  label={el.xLabel}
                  x={ox + xLen + 14}
                  y={oy + 2}
                  className="text-stone-700 dark:text-stone-300 font-serif italic"
                />
              )}
              <line
                x1={ox}
                y1={oy}
                x2={ox}
                y2={oy - yLen}
                stroke="#78716c"
                strokeWidth="1.5"
                markerEnd="url(#arrow-axis)"
                className="stroke-stone-500 dark:stroke-stone-400"
              />
              {el.yLabel && (
                <DiagramLabel
                  label={el.yLabel}
                  x={ox}
                  y={oy - yLen - 14}
                  className="text-stone-700 dark:text-stone-300 font-serif italic"
                />
              )}
            </g>
          );
        }

        case 'mass': {
          const x = Number(el.x);
          const y = Number(el.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          const size = Number(el.size) || 16;
          const label = String(el.label || 'm');

          if (el.shape === 'circle') {
            return (
              <g key={`mass-${index}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={size}
                  fill="url(#sphere-gradient)"
                  stroke="#1c1917"
                  strokeWidth="2"
                  filter="url(#component-shadow)"
                  className="stroke-stone-900 dark:stroke-stone-200"
                />
                <DiagramLabel
                  label={label}
                  x={x}
                  y={y}
                  className="font-bold text-stone-950 dark:text-stone-100"
                />
              </g>
            );
          } else {
            return (
              <g key={`mass-${index}`}>
                <rect
                  x={x - size}
                  y={y - size}
                  width={size * 2}
                  height={size * 2}
                  fill="url(#block-gradient)"
                  stroke="#1c1917"
                  strokeWidth="2"
                  rx="3"
                  filter="url(#component-shadow)"
                  className="stroke-stone-900 dark:stroke-stone-200"
                />
                <DiagramLabel
                  label={label}
                  x={x}
                  y={y}
                  className="font-bold text-stone-950 dark:text-stone-100"
                />
              </g>
            );
          }
        }

        case 'vector': {
          const p1 = toCoords(el.from);
          const p2 = toCoords(el.to);
          if (!p1 || !p2) return null;

          const [x1, y1] = p1;
          const [x2, y2] = p2;
          const color = typeof el.color === 'string' ? el.color : '#2563eb';
          const safeColorId = color.replace(/[^a-zA-Z0-9]/g, '');

          return (
            <g key={`vec-${index}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth="2.25"
                markerEnd={`url(#arrow-${safeColorId})`}
                filter="url(#vector-shadow)"
              />
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={x2 + 14}
                  y={y2}
                  color={color}
                  className="font-bold drop-shadow-xs"
                />
              )}
            </g>
          );
        }

        case 'angle': {
          const pCenter = toCoords(el.center);
          if (!pCenter) return null;
          const [cx, cy] = pCenter;
          const r = Number(el.radius) || 32;
          const sAngle = Number(el.startAngle) || 0;
          const eAngle = Number(el.endAngle) || 90;

          const rad1 = (sAngle * Math.PI) / 180;
          const rad2 = (eAngle * Math.PI) / 180;

          const ax1 = cx + r * Math.cos(rad1);
          const ay1 = cy + r * Math.sin(rad1);
          const ax2 = cx + r * Math.cos(rad2);
          const ay2 = cy + r * Math.sin(rad2);

          const midAngle = (rad1 + rad2) / 2;
          const textX = cx + (r + 14) * Math.cos(midAngle);
          const textY = cy + (r + 14) * Math.sin(midAngle);

          return (
            <g key={`angle-${index}`}>
              {/* Hafif renkli açı sektörü */}
              <path
                d={`M ${cx} ${cy} L ${ax1} ${ay1} A ${r} ${r} 0 0 0 ${ax2} ${ay2} Z`}
                fill="rgba(217, 119, 6, 0.08)"
              />
              <path
                d={`M ${ax1} ${ay1} A ${r} ${r} 0 0 0 ${ax2} ${ay2}`}
                fill="none"
                stroke="#d97706"
                strokeWidth="1.5"
              />
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={textX}
                  y={textY}
                  color="#b45309"
                  className="font-semibold text-amber-800 dark:text-amber-400"
                />
              )}
            </g>
          );
        }

        case 'point': {
          const x = Number(el.x);
          const y = Number(el.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

          return (
            <g key={`point-${index}`}>
              <circle cx={x} cy={y} r="3.5" fill="#1c1917" className="fill-stone-900 dark:fill-stone-100" />
              {el.label && <DiagramLabel label={el.label} x={x + 12} y={y - 8} className="text-stone-700 dark:text-stone-300" />}
            </g>
          );
        }

        case 'polygon': {
          if (!Array.isArray(el.points) || el.points.length < 3) return null;
          const validCoords: [number, number][] = [];
          for (const p of el.points) {
            const c = toCoords(p);
            if (c) validCoords.push(c);
          }
          if (validCoords.length < 3) return null;

          const pointsStr = validCoords.map(([x, y]) => `${x},${y}`).join(' ');
          const fill = el.fill || 'rgba(37, 99, 235, 0.08)';
          const stroke = el.stroke || '#2563eb';
          const strokeWidth = Number(el.strokeWidth) || 1.75;

          let centroidX = 0;
          let centroidY = 0;
          for (const [x, y] of validCoords) {
            centroidX += x;
            centroidY += y;
          }
          centroidX /= validCoords.length;
          centroidY /= validCoords.length;

          return (
            <g key={`polygon-${index}`}>
              <polygon
                points={pointsStr}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                filter="url(#component-shadow)"
              />
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={centroidX}
                  y={centroidY}
                  color={stroke}
                  className="font-semibold"
                />
              )}
            </g>
          );
        }

        case 'curve': {
          if (!Array.isArray(el.points) || el.points.length < 2) return null;
          const validPoints: [number, number][] = [];
          for (const p of el.points) {
            const c = toCoords(p);
            if (c) validPoints.push(c);
          }
          if (validPoints.length < 2) return null;

          // Catmull-Rom kardinal spline ile yumuşak eğri (Smooth Bézier) oluştur
          let curvePath = `M ${validPoints[0][0]} ${validPoints[0][1]}`;
          if (validPoints.length === 2) {
            curvePath += ` L ${validPoints[1][0]} ${validPoints[1][1]}`;
          } else {
            for (let i = 0; i < validPoints.length - 1; i++) {
              const p0 = validPoints[Math.max(0, i - 1)];
              const p1 = validPoints[i];
              const p2 = validPoints[i + 1];
              const p3 = validPoints[Math.min(validPoints.length - 1, i + 2)];

              const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
              const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
              const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
              const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

              curvePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
            }
          }

          const stroke = el.color || '#2563eb';
          const strokeWidth = Number(el.strokeWidth) || 2.25;
          let strokeDasharray: string | undefined;
          if (el.style === 'dashed') strokeDasharray = '6,4';
          else if (el.style === 'dotted') strokeDasharray = '2,3';

          // İntegral taralı alanı (Area under curve)
          let fillPath: string | null = null;
          let fillColor = 'rgba(37, 99, 235, 0.15)';
          if (el.fillUnder) {
            if (typeof el.fillUnder === 'string') {
              fillColor = el.fillUnder;
            }
            const baselineY = typeof el.fillBaselineY === 'number'
              ? el.fillBaselineY
              : Math.max(...validPoints.map((p) => p[1]));

            const firstX = validPoints[0][0];
            const lastX = validPoints[validPoints.length - 1][0];

            fillPath = `${curvePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
          }

          // Etiket konumu (eğrinin ortası veya zirvesi)
          const midIdx = Math.floor(validPoints.length / 2);
          const labelPoint = validPoints[midIdx];

          return (
            <g key={`curve-${index}`}>
              {fillPath && (
                <path
                  d={fillPath}
                  fill={fillColor}
                  stroke="none"
                />
              )}
              <path
                d={curvePath}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#component-shadow)"
              />
              {el.label && (
                <DiagramLabel
                  label={el.label}
                  x={labelPoint[0]}
                  y={labelPoint[1] - 14}
                  color={stroke}
                  className="font-bold drop-shadow-xs"
                />
              )}
            </g>
          );
        }

        default:
          return null;
      }
    } catch (err) {
      console.warn(translate("SimpleDiagram element render hatası önlendi:"), err);
      return null;
    }
  };

  const vectorColors = Array.from(
    new Set([
      '#2563eb',
      '#dc2626',
      '#16a34a',
      '#9333ea',
      '#d97706',
      ...elements
        .filter((e): e is Extract<DiagramElement, { type: 'vector' }> => e?.type === 'vector')
        .map((e) => (typeof e.color === 'string' ? e.color : '#2563eb'))
    ])
  );

  const diagramContent = (
    <div className="simple-diagram-card relative bg-white dark:bg-paper border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm print:bg-white print:border-stone-300 print:shadow-none overflow-hidden transition-all">
      {/* Üst Araç Çubuğu */}
      <div className="simple-diagram-toolbar print:hidden flex items-center justify-between px-3 py-1.5 border-b border-stone-200/80 dark:border-stone-800/80 bg-stone-50 dark:bg-panel text-[11px] text-stone-600 dark:text-stone-400 font-sans">
        <div className="flex items-center gap-1.5 font-medium">
          <Compass className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{translate("Şematik Fizik & Devre Modellemesi")}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
            title={translate("Küçült")}
            className="p-1 hover:bg-stone-200 dark:hover:bg-stone-800 rounded cursor-pointer transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1.0)}
            title={translate("Ölçeği Sıfırla (%100)")}
            className="px-1.5 py-0.5 text-[10px] hover:bg-stone-200 dark:hover:bg-stone-800 rounded font-mono cursor-pointer transition-colors"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
            title={translate("Büyüt")}
            className="p-1 hover:bg-stone-200 dark:hover:bg-stone-800 rounded cursor-pointer transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? translate("Tam Ekrandan Çık") : translate("Tam Ekran İncele")}
            className="p-1 hover:bg-stone-200 dark:hover:bg-stone-800 rounded ml-1 cursor-pointer transition-colors text-amber-800 dark:text-amber-400"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* SVG Çizim Alanı */}
      <div className="p-4 flex justify-center items-center overflow-auto max-w-full print:p-2 print:overflow-visible print:bg-white">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width * zoom}
          height={height * zoom}
          className="overflow-visible transition-all duration-150"
        >
          <defs>
            {/* Milimetrik Mühendislik Izgarası */}
            <pattern id="academic-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-stone-300/40 dark:text-stone-700/40"
              />
            </pattern>

            {/* Gölgelendirme Filtresi */}
            <filter id="component-shadow" x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodOpacity="0.1" />
            </filter>
            <filter id="vector-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0.5" dy="1" stdDeviation="1" floodOpacity="0.15" />
            </filter>

            {/* 3D Küre Gradyanı */}
            <radialGradient id="sphere-gradient" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#f5f5f4" />
              <stop offset="85%" stopColor="#78716c" />
              <stop offset="100%" stopColor="#44403c" />
            </radialGradient>

            {/* 3D Blok Gradyanı */}
            <linearGradient id="block-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fafaf9" />
              <stop offset="70%" stopColor="#e7e5e4" />
              <stop offset="100%" stopColor="#a8a29e" />
            </linearGradient>

            {/* Kaynak Çember Gradyanı */}
            <radialGradient id="source-gradient" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#eff6ff" />
              <stop offset="100%" stopColor="#bfdbfe" />
            </radialGradient>

            {/* Eksen Oku */}
            <marker
              id="arrow-axis"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#78716c" className="fill-stone-500 dark:fill-stone-400" />
            </marker>

            {/* Renkli Vektör Okları */}
            {vectorColors.map((color) => {
              const safeColorId = color.replace(/[^a-zA-Z0-9]/g, '');
              return (
                <marker
                  key={color}
                  id={`arrow-${safeColorId}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={color} />
                </marker>
              );
            })}
          </defs>

          {/* Izgara Arka Planı */}
          <rect width={width} height={height} fill="url(#academic-grid)" />

          {/* Elemanlar */}
          {elements.map((el, idx) => renderElement(el, idx))}
        </svg>
      </div>
    </div>
  );

  return (
    <>
      <figure className={`my-6 flex flex-col items-center select-none ${className}`}>
        {diagramContent}
        {caption && (
          <figcaption className="mt-2 text-xs text-stone-600 dark:text-stone-400 font-serif italic text-center max-w-md">
            <KaTeXRenderer content={caption} />
          </figcaption>
        )}
      </figure>

      {/* Tam Ekran İnceleme Modalı */}
      {isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsFullscreen(false)}
        >
          <div
            className="w-full max-w-4xl bg-white dark:bg-panel border border-stone-200 dark:border-stone-800 rounded-xl shadow-2xl p-6 relative flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 mb-4 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2 text-sm font-sans font-semibold text-stone-900 dark:text-stone-100">
                <Compass className="w-4 h-4 text-amber-600" />
                <span>{translate("Yüksek Çözünürlüklü Şematik İnceleme")}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="text-xs font-sans px-3 py-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 cursor-pointer transition-colors"
              >
                {translate("Kapat (ESC)")}</button>
            </div>

            <div className="overflow-auto max-h-[70vh] w-full flex justify-center py-4">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                width={width * Math.max(zoom, 1.4)}
                height={height * Math.max(zoom, 1.4)}
                className="overflow-visible"
              >
                <rect width={width} height={height} fill="url(#academic-grid)" />
                {elements.map((el, idx) => renderElement(el, idx))}
              </svg>
            </div>

            {caption && (
              <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-800 text-center text-xs font-serif italic text-stone-600 dark:text-stone-300 max-w-xl">
                <KaTeXRenderer content={caption} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
