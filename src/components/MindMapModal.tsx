import { translate } from '../i18n';
import React, { useState, useRef, useEffect } from 'react';
import { DerivationTreeNode } from '../domain/types';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldCheck,
  BookOpen,
  FileText,
  HelpCircle,
  Network,
  Sparkles
} from 'lucide-react';

interface MindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  tree: DerivationTreeNode;
  activeNodeId: string;
  onSelectNode: (nodeId: string) => void;
}

interface PositionedNode {
  node: DerivationTreeNode;
  x: number;
  y: number;
  width: number;
  isActive: boolean;
  children: PositionedNode[];
}

interface ConnectionLine {
  from: [number, number];
  to: [number, number];
  isPathActive: boolean;
  isAxiom: boolean;
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 72;
const LEVEL_HEIGHT = 130;
const SIBLING_GAP = 36;

/**
 * Özyinelemeli ağaç genişliği ve koordinat hesaplayıcı (Aşağı doğru dallanma)
 */
function buildLayout(
  node: DerivationTreeNode,
  depth: number,
  activeNodeId: string,
  ancestorIsActive: boolean
): { positioned: PositionedNode; subtreeWidth: number } {
  const isCurrentActive = node.id === activeNodeId;
  const isPathActive = ancestorIsActive || isCurrentActive;

  if (!node.children || node.children.length === 0) {
    return {
      positioned: {
        node,
        x: 0,
        y: depth * LEVEL_HEIGHT + 60,
        width: NODE_WIDTH,
        isActive: isCurrentActive,
        children: []
      },
      subtreeWidth: NODE_WIDTH
    };
  }

  const childLayouts = node.children.map((c) =>
    buildLayout(c, depth + 1, activeNodeId, isPathActive)
  );

  const totalChildrenWidth =
    childLayouts.reduce((acc, curr) => acc + curr.subtreeWidth, 0) +
    (childLayouts.length - 1) * SIBLING_GAP;

  const subtreeWidth = Math.max(NODE_WIDTH, totalChildrenWidth);

  // Çocukları yatayda ortala
  let currentX = 0;
  const positionedChildren: PositionedNode[] = [];

  for (const child of childLayouts) {
    const childCenterOffset = currentX + child.subtreeWidth / 2;
    child.positioned.x = childCenterOffset;
    positionedChildren.push(child.positioned);
    currentX += child.subtreeWidth + SIBLING_GAP;
  }

  return {
    positioned: {
      node,
      x: totalChildrenWidth / 2,
      y: depth * LEVEL_HEIGHT + 60,
      width: NODE_WIDTH,
      isActive: isCurrentActive,
      children: positionedChildren
    },
    subtreeWidth
  };
}

/**
 * X koordinatlarını kök referansına göre öteleyen ve bağlantı çizgilerini toplayan fonksiyon
 */
function flattenAndConnect(
  root: PositionedNode,
  offsetX: number
): { nodes: PositionedNode[]; lines: ConnectionLine[] } {
  const allNodes: PositionedNode[] = [];
  const allLines: ConnectionLine[] = [];

  function traverse(curr: PositionedNode, parent?: PositionedNode) {
    curr.x += offsetX;
    allNodes.push(curr);

    if (parent) {
      const from: [number, number] = [parent.x, parent.y + NODE_HEIGHT / 2];
      const to: [number, number] = [curr.x, curr.y - NODE_HEIGHT / 2];
      const isPathActive = curr.isActive || parent.isActive;
      allLines.push({
        from,
        to,
        isPathActive,
        isAxiom: Boolean(curr.node.isAxiomatic)
      });
    }

    for (const ch of curr.children) {
      traverse(ch, curr);
    }
  }

  traverse(root);
  return { nodes: allNodes, lines: allLines };
}

export const MindMapModal: React.FC<MindMapModalProps> = ({
  isOpen,
  onClose,
  tree,
  activeNodeId,
  onSelectNode
}) => {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Ağaç koordinatlarını hesapla
  const { positioned: rootPositioned, subtreeWidth } = buildLayout(
    tree,
    0,
    activeNodeId,
    false
  );

  const canvasWidth = Math.max(900, subtreeWidth + 160);
  const maxDepth = Math.max(
    ...function getMaxDepth(n: DerivationTreeNode): number[] {
      return [n.depth, ...(n.children ? n.children.flatMap(getMaxDepth) : [])];
    }(tree)
  );
  const canvasHeight = Math.max(650, (maxDepth + 1) * LEVEL_HEIGHT + 140);

  const offsetX = (canvasWidth - subtreeWidth) / 2;
  const { nodes, lines } = flattenAndConnect(rootPositioned, offsetX);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={translate("Türetim Zihin Haritası")}
      className="fixed inset-0 z-50 flex flex-col bg-stone-900/80 backdrop-blur-md animate-fade-in"
    >
      {/* Üst Bar / Kontroller */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#181715]/95 border-b border-stone-800 text-stone-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide uppercase font-sans">
                {translate("Epistemik Zihin Haritası")}</h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-sans px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Sparkles className="w-2.5 h-2.5" />
                {translate("Aşağı Doğru Dallanan Ağaç")}</span>
            </div>
            <p className="text-xs text-stone-400 font-serif italic">
              {translate("Herhangi bir düğüme tıklayarak o derinlik katmanına doğrudan geçiş yapabilirsiniz.")}</p>
          </div>
        </div>

        {/* Yakınlaştırma ve Kapatma Butonları */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-stone-800/80 rounded-lg p-0.5 border border-stone-700">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
              className="p-1.5 hover:bg-stone-700 text-stone-300 rounded transition-colors"
              title={translate("Uzaklaştır")}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono px-2 text-stone-300">
              %{Math.round(zoom * 100)}
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
              className="p-1.5 hover:bg-stone-700 text-stone-300 rounded transition-colors"
              title={translate("Yakınlaştır")}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1.5 hover:bg-stone-700 text-stone-400 hover:text-stone-200 rounded transition-colors"
              title={translate("Sıfırla")}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors ml-2"
            title="Kapat (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Tuval Alanı (Subtle Gray Dot Grid & Infinite Scroll) */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-8 relative flex items-center justify-center bg-[#f9f8f5] dark:bg-canvas select-none mindmap-dot-grid"
      >
        <div
          className="relative transition-transform duration-150 origin-top"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${zoom})`
          }}
        >
          {/* SVG Bağlantı Çizgileri */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={canvasWidth}
            height={canvasHeight}
          >
            <defs>
              <linearGradient id="activeBranchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="axiomBranchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#059669" stopOpacity="1" />
              </linearGradient>
            </defs>

            {lines.map((line, idx) => {
              const [x1, y1] = line.from;
              const [x2, y2] = line.to;
              const midY = (y1 + y2) / 2;
              const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

              return (
                <g key={`branch-line-${idx}`}>
                  {/* Arka plan statik gölge yolu */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={
                      line.isAxiom
                        ? 'rgba(16, 185, 129, 0.25)'
                        : line.isPathActive
                        ? 'rgba(245, 158, 11, 0.3)'
                        : '#383531'
                    }
                    strokeWidth={line.isPathActive || line.isAxiom ? 3 : 1.75}
                    strokeLinecap="round"
                  />

                  {/* Animasyonlu akan enerji yolu */}
                  {(line.isPathActive || line.isAxiom) && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={line.isAxiom ? 'url(#axiomBranchGrad)' : 'url(#activeBranchGrad)'}
                      strokeWidth={line.isPathActive ? 2.5 : 2}
                      strokeDasharray="6,4"
                      className="animate-branch-flow"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Çıkış ve Giriş Soket Noktaları */}
                  <circle
                    cx={x1}
                    cy={y1}
                    r={3}
                    className={line.isPathActive ? 'fill-amber-500' : 'fill-stone-600'}
                  />
                  <circle
                    cx={x2}
                    cy={y2}
                    r={3}
                    className={line.isAxiom ? 'fill-emerald-400' : line.isPathActive ? 'fill-amber-400' : 'fill-stone-600'}
                  />
                </g>
              );
            })}
          </svg>

          {/* Düğüm Kartları */}
          {nodes.map((pos) => {
            const isRoot = pos.node.depth === 0;
            const isAxiomatic = Boolean(pos.node.isAxiomatic);
            const isMathAxiom = pos.node.axiomType === 'mathematics';
            const isActive = pos.isActive;

            return (
              <div
                key={pos.node.id}
                onClick={() => {
                  onSelectNode(pos.node.id);
                  onClose();
                }}
                className={`absolute rounded-xl p-2.5 cursor-pointer transition-all duration-200 border text-left shadow-lg animate-node-enter ${
                  isActive
                    ? 'bg-amber-950/80 border-amber-500 text-amber-100 ring-2 ring-amber-500/60 shadow-amber-500/20 animate-radar-pulse'
                    : isAxiomatic
                    ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-100 hover:border-emerald-500 hover:bg-emerald-900/60 shadow-emerald-950/40'
                    : isRoot
                    ? 'bg-stone-800/90 border-amber-700/60 text-stone-100 hover:border-amber-500 hover:bg-stone-800'
                    : 'bg-[#1e1d1a]/90 border-stone-800 text-stone-300 hover:border-stone-600 hover:bg-stone-800/90 hover:text-stone-100'
                }`}
                style={{
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  left: pos.x - NODE_WIDTH / 2,
                  top: pos.y - NODE_HEIGHT / 2
                }}
              >
                {/* Üst Satır: İkon ve Rozet */}
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isRoot ? (
                      <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : isAxiomatic ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : pos.node.contextualQuery ? (
                      <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    )}

                    <span className="text-[10px] font-mono text-stone-400 font-medium">
                      D{pos.node.depth}
                    </span>
                  </div>

                  {isAxiomatic ? (
                    <span className="text-[8px] uppercase tracking-wider font-sans font-bold bg-emerald-900/80 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-700/80 shrink-0">
                      {isMathAxiom ? translate("Öklid") : translate("Aksiyom")}
                    </span>
                  ) : pos.node.targetDisplayNumber !== undefined ? (
                    <span className="text-[9px] font-mono text-amber-400/90 shrink-0">
                      ({pos.node.targetDisplayNumber})
                    </span>
                  ) : null}
                </div>

                {/* Başlık Metni */}
                <div className="text-xs font-serif font-medium leading-snug line-clamp-2">
                  {translate(pos.node.label)}
                </div>

                {/* Alt Vurgu Durumu */}
                {isActive && (
                  <div className="absolute bottom-1 right-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[9px] uppercase font-sans font-semibold text-amber-300">
                      {translate("Aktif")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
