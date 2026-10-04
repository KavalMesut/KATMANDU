import { translate } from '../i18n';
import React, { useState, useRef, useEffect } from 'react';
import { DerivationTreeNode } from '../domain/types';
import type { SolutionExecutionReport } from '../domain/usageReport';
import { ExecutionReportPanel } from './ExecutionReportPanel';
import {
  GitFork,
  ShieldCheck,
  FileText,
  HelpCircle,
  ArrowLeft,
  BookOpen,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles
} from 'lucide-react';

interface DerivationTreePanelProps {
  hidden?: boolean;
  tree: DerivationTreeNode;
  activeNodeId: string;
  currentDepth: number;
  hasDocument?: boolean;
  executionReport?: SolutionExecutionReport;
  onSelectNode: (nodeId: string) => void;
  className?: string;
}

interface PositionedTreeNode {
  node: DerivationTreeNode;
  x: number;
  y: number;
  width: number;
  isActive: boolean;
  children: PositionedTreeNode[];
}

interface BranchPath {
  from: [number, number];
  to: [number, number];
  isPathActive: boolean;
  isAxiom: boolean;
}

const CARD_WIDTH = 156;
const CARD_HEIGHT = 62;
const LEVEL_HEIGHT = 105;
const SIBLING_GAP = 24;

/**
 * 2 Boyutlu Hiyerarşik Ağaç Yerleşim Algoritması:
 * Ebeveyn en üstte, çocuk dallar aynı seviyede yan yana (sağa/sola) dallanır.
 */
function computeTreeLayout(
  node: DerivationTreeNode,
  depth: number,
  activeNodeId: string
): { positioned: PositionedTreeNode; subtreeWidth: number } {
  const isCurrentActive = node.id === activeNodeId;

  if (!node.children || node.children.length === 0) {
    return {
      positioned: {
        node,
        x: 0,
        y: depth * LEVEL_HEIGHT + 45,
        width: CARD_WIDTH,
        isActive: isCurrentActive,
        children: []
      },
      subtreeWidth: CARD_WIDTH
    };
  }

  const childLayouts = node.children.map((c) =>
    computeTreeLayout(c, depth + 1, activeNodeId)
  );

  const totalChildrenWidth =
    childLayouts.reduce((sum, c) => sum + c.subtreeWidth, 0) +
    (childLayouts.length - 1) * SIBLING_GAP;

  const subtreeWidth = Math.max(CARD_WIDTH, totalChildrenWidth);

  let curX = 0;
  const positionedChildren: PositionedTreeNode[] = [];

  for (const child of childLayouts) {
    const centerOffset = curX + child.subtreeWidth / 2;
    child.positioned.x = centerOffset;
    positionedChildren.push(child.positioned);
    curX += child.subtreeWidth + SIBLING_GAP;
  }

  return {
    positioned: {
      node,
      x: totalChildrenWidth / 2,
      y: depth * LEVEL_HEIGHT + 45,
      width: CARD_WIDTH,
      isActive: isCurrentActive,
      children: positionedChildren
    },
    subtreeWidth
  };
}

/**
 * Düğümleri ve aralarındaki kavisli SVG dallarını toplayan yardımcı
 */
function collectNodesAndBranches(
  root: PositionedTreeNode,
  offsetX: number
): { nodes: PositionedTreeNode[]; branches: BranchPath[] } {
  const allNodes: PositionedTreeNode[] = [];
  const allBranches: BranchPath[] = [];

  function traverse(curr: PositionedTreeNode, parent?: PositionedTreeNode) {
    curr.x += offsetX;
    allNodes.push(curr);

    if (parent) {
      const from: [number, number] = [parent.x, parent.y + CARD_HEIGHT / 2];
      const to: [number, number] = [curr.x, curr.y - CARD_HEIGHT / 2];
      const isPathActive = curr.isActive || parent.isActive;
      allBranches.push({
        from,
        to,
        isPathActive,
        isAxiom: Boolean(curr.node.isAxiomatic)
      });
    }

    for (const child of curr.children) {
      traverse(child, curr);
    }
  }

  traverse(root);
  return { nodes: allNodes, branches: allBranches };
}

export const DerivationTreePanel: React.FC<DerivationTreePanelProps> = ({
  hidden = false,
  tree,
  activeNodeId,
  currentDepth,
  hasDocument = true,
  executionReport,
  onSelectNode,
  className = ''
}) => {
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('katmandu_tree_zoom');
      if (saved) {
        const val = parseFloat(saved);
        if (val >= 0.5 && val <= 2.0) return val;
      }
    } catch {}
    return 1;
  });

  useEffect(() => {
    try {
      localStorage.setItem('katmandu_tree_zoom', String(zoom));
    } catch {}
  }, [zoom]);

  const handleTreeWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom((z) => {
        const next = Math.round((z + delta) * 10) / 10;
        return Math.max(0.5, Math.min(2.0, next));
      });
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  // Sağa/Sola Genişletme & Küçültme Durumu (Horizontal Resizable Panel)
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('katmandu_panel_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (val >= 280 && val <= 1400) return val;
      }
    } catch {}
    return 480;
  });
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(panelWidth);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Sola çektikçe panel genişler, sağa çektikçe daralır
      const delta = startXRef.current - e.clientX;
      const maxAllowed = Math.round(window.innerWidth * 0.75);
      const newWidth = Math.max(280, Math.min(maxAllowed, startWidthRef.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('katmandu_panel_width', String(panelWidth));
      } catch {}
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, panelWidth]);

  // Tutamaç Bileşeni (Resize Handle)
  const renderResizeHandle = () => (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={() => {
        setPanelWidth(480);
        try {
          localStorage.setItem('katmandu_panel_width', '480');
        } catch {}
      }}
      title={translate("Sağa/sola sürükleyerek genişliği ayarlayın (Sıfırlamak için çift tıklayın)")}
      className={`workspace-resize-handle absolute top-0 bottom-0 -left-1 w-2.5 cursor-col-resize z-30 group flex items-center justify-center transition-colors select-none ${
        isResizing ? 'bg-amber-600/30' : 'hover:bg-amber-500/20'
      }`}
    >
      <div
        className={`w-0.5 h-8 rounded-full transition-colors ${
          isResizing
            ? 'bg-amber-600 dark:bg-amber-400'
            : 'bg-stone-300 dark:bg-stone-700 group-hover:bg-amber-500 dark:group-hover:bg-amber-400'
        }`}
      />
    </div>
  );

  // Belge yoksa boş durum
  if (!hasDocument) {
    return (
      <aside
        hidden={hidden}
        data-workspace-panel="tree"
        aria-label={translate("Türetim Dallanma Ağacı")}
        style={{ width: `${panelWidth}px` }}
        className={`relative shrink-0 bg-stone-50/70 dark:bg-canvas border-l border-stone-200 dark:border-stone-800 flex flex-col justify-between transition-colors select-none ${className}`}
      >
        {renderResizeHandle()}
        <div className="flex flex-col h-full">
          <div className="p-4 pb-3 border-b border-stone-200 dark:border-stone-800 bg-stone-100/60 dark:bg-canvas shrink-0">
            <div className="spectrum-tree-heading flex items-center gap-2 text-stone-800 dark:text-stone-200">
              <GitFork className="w-4 h-4 text-amber-800 dark:text-amber-500" />
              <span className="text-xs uppercase tracking-wider font-semibold font-sans">
                {translate("Dallanma Ağacı")}</span>
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px] text-stone-400 dark:text-stone-500">
              <span className="font-serif italic flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-stone-400" />
                {translate("Ağaç Görünümü")}</span>
              <span className="font-mono px-1.5 py-0.2 rounded bg-stone-200/50 dark:bg-stone-800/50 text-stone-500 text-[10px]">
                {translate("Beklemede")}</span>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-stone-400 dark:text-stone-500 font-serif italic text-xs leading-relaxed">
            <GitFork className="w-8 h-8 mx-auto mb-3 opacity-30 text-amber-700 dark:text-amber-400" />
            <p>
              {translate("Henüz aktif bir çözüm yok. Bir problem çözüldüğünde ve denklemlere tıklandığında, türetim dalları burada aşağı ve sağa/sola doğru ayrılarak görselleşecektir.")}</p>
          </div>
        </div>
      </aside>
    );
  }

  // 2D Ağaç Yerleşimini Hesapla (Ana Çözüm ve Paralel Alternatif Yollar - Aynı Seviyede)
  const mainBranches: DerivationTreeNode[] = [tree, ...(tree.parallelPaths || [])];
  const MAIN_BRANCH_GAP = 56;

  const branchLayouts = mainBranches.map((branch) =>
    computeTreeLayout(branch, 0, activeNodeId)
  );

  const totalBranchesWidth =
    branchLayouts.reduce((sum, b) => sum + b.subtreeWidth, 0) +
    (branchLayouts.length - 1) * MAIN_BRANCH_GAP;

  function getMaxDepth(n: DerivationTreeNode): number[] {
    const self = n.depth;
    const ch = n.children ? n.children.flatMap(getMaxDepth) : [];
    const pp = n.parallelPaths ? n.parallelPaths.flatMap(getMaxDepth) : [];
    return [self, ...ch, ...pp];
  }
  const maxDepth = Math.max(...getMaxDepth(tree));

  const canvasWidth = Math.max(panelWidth - 32, totalBranchesWidth + 80, 480);
  const canvasHeight = Math.max(380, (maxDepth + 1) * LEVEL_HEIGHT + 70);
  const baseOffsetX = Math.max(20, (canvasWidth - totalBranchesWidth) / 2);

  const nodes: PositionedTreeNode[] = [];
  const branches: BranchPath[] = [];
  const parallelBridges: Array<{ from: [number, number]; to: [number, number] }> = [];

  let curBranchX = baseOffsetX;
  const rootCenters: Array<[number, number]> = [];

  for (const bLayout of branchLayouts) {
    const { nodes: bNodes, branches: bBranches } = collectNodesAndBranches(
      bLayout.positioned,
      curBranchX
    );
    nodes.push(...bNodes);
    branches.push(...bBranches);

    if (bNodes.length > 0) {
      rootCenters.push([bNodes[0].x, bNodes[0].y]);
    }

    curBranchX += bLayout.subtreeWidth + MAIN_BRANCH_GAP;
  }

  // Birden fazla kök varsa aralarına şık yatay bağlantı köprüsü ekle
  for (let i = 0; i < rootCenters.length - 1; i++) {
    parallelBridges.push({
      from: [rootCenters[i][0] + CARD_WIDTH / 2, rootCenters[i][1]],
      to: [rootCenters[i + 1][0] - CARD_WIDTH / 2, rootCenters[i + 1][1]]
    });
  }

  return (
    <aside
      hidden={hidden}
      data-workspace-panel="tree"
      aria-label={translate("Türetim Dallanma Ağacı")}
      style={{ width: `${panelWidth}px` }}
      className={`relative shrink-0 bg-[#f8f5eb]/90 dark:bg-canvas border-l border-[#e4dcce] dark:border-stone-800 flex flex-col h-full min-h-0 overflow-hidden transition-colors select-none ${className}`}
    >
      {renderResizeHandle()}

      {/* Üst Başlık ve Yakınlaştırma Kontrolleri */}
      <div className="p-4 pb-3 border-b border-[#e4dcce] dark:border-stone-800 bg-[#f3ede0]/90 dark:bg-canvas backdrop-blur-md shrink-0 z-10 sticky top-0">
        <div className="flex items-center justify-between">
          <div className="spectrum-tree-heading flex items-center gap-2 text-stone-800 dark:text-stone-200">
            <GitFork className="w-4 h-4 text-amber-800 dark:text-amber-500 animate-pulse" />
            <span className="text-xs uppercase tracking-wider font-semibold font-sans">
              {translate("Dallanma Ağacı")}</span>
          </div>

          {/* Kontroller: Zoom & Reset */}
          <div className="flex items-center gap-1 bg-[#ede5d4] dark:bg-stone-800/90 rounded px-1 py-0.5 border border-[#dcceb8] dark:border-stone-700">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              className="p-1 hover:bg-[#dfd4c0] dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 rounded transition-colors cursor-pointer"
              title={translate("Uzaklaştır (%50 min)")}
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-mono px-1 text-stone-700 dark:text-stone-300 font-medium min-w-[34px] text-center">
              %{Math.round(zoom * 100)}
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))}
              className="p-1 hover:bg-[#dfd4c0] dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 rounded transition-colors cursor-pointer"
              title={translate("Yakınlaştır (%200 max)")}
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1 hover:bg-[#dfd4c0] dark:hover:bg-stone-700 text-stone-500 dark:text-stone-400 rounded transition-colors ml-0.5 cursor-pointer"
              title={translate("Ölçeği Sıfırla (%100)")}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 text-[11px] text-stone-500 dark:text-stone-400">
          <span className="font-serif italic flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            {translate("Aşağı & Sağa/Sola Dallanan Harita")}</span>
          <span className="font-mono px-1.5 py-0.2 rounded bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[10px]">
            {translate("Derinlik")}{currentDepth}
          </span>
        </div>
      </div>

      {/* 2D Dallanma Tuvali (Subtle Gray Dot Grid) */}
      <div
        ref={containerRef}
        onWheel={handleTreeWheel}
        className="flex-1 min-h-0 overflow-auto p-4 relative bg-[#f9f8f5] dark:bg-canvas canvas-dot-grid"
      >
        <div
          style={{
            width: `${Math.max(canvasWidth * zoom, canvasWidth)}px`,
            height: `${Math.max(canvasHeight * zoom, canvasHeight)}px`,
            minWidth: '100%',
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <div
            className="relative transition-transform duration-100 shrink-0"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${zoom})`,
              transformOrigin: 'top center'
            }}
          >
          {/* Kavisli SVG Dallanma Çizgileri */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={canvasWidth}
            height={canvasHeight}
          >
            <defs>
              <linearGradient id="activePanelBranchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--spectrum-branch-start, var(--color-amber-400))" stopOpacity="0.9" />
                <stop offset="100%" stopColor="var(--spectrum-branch-end, var(--color-amber-600))" stopOpacity="1" />
              </linearGradient>
            </defs>

            {branches.map((b, idx) => {
              const [x1, y1] = b.from;
              const [x2, y2] = b.to;
              const midY = (y1 + y2) / 2;
              const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

              return (
                <g key={`branch-path-${idx}`}>
                  {/* Arka plan statik kılavuz çizgisi */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={
                      b.isAxiom
                        ? 'rgba(16, 185, 129, 0.3)'
                        : b.isPathActive
                        ? 'rgba(217, 119, 6, 0.35)'
                        : '#d6d3d1'
                    }
                    className="dark:stroke-stone-700"
                    strokeWidth={b.isPathActive ? 2.5 : 1.5}
                    strokeLinecap="round"
                  />

                  {/* Aktif rotada akan kesikli enerji çizgisi */}
                  {b.isPathActive && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="url(#activePanelBranchGrad)"
                      strokeWidth={2}
                      strokeDasharray="5,3"
                      className="animate-branch-flow"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Çıkış ve Giriş Bağlantı Pimleri */}
                  <circle
                    cx={x1}
                    cy={y1}
                    r={2.5}
                    className={b.isPathActive ? 'fill-amber-500' : 'fill-stone-400 dark:fill-stone-600'}
                  />
                  <circle
                    cx={x2}
                    cy={y2}
                    r={2.5}
                    className={
                      b.isAxiom
                        ? 'fill-emerald-500'
                        : b.isPathActive
                        ? 'fill-amber-500'
                        : 'fill-stone-400 dark:fill-stone-600'
                    }
                  />
                </g>
              );
            })}

            {/* Paralel Kökler Arası Yatay Bağlantı Köprüsü (1. Yol ve 2. Yol aynı seviyede) */}
            {parallelBridges.map((bridge, bIdx) => {
              const [x1, y1] = bridge.from;
              const [x2, y2] = bridge.to;
              const midX = (x1 + x2) / 2;
              return (
                <g key={`parallel-bridge-${bIdx}`}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(99, 102, 241, 0.5)"
                    strokeWidth={2}
                    strokeDasharray="4,4"
                  />
                  <circle cx={x1} cy={y1} r={3} className="fill-indigo-500" />
                  <circle cx={x2} cy={y2} r={3} className="fill-indigo-500" />
                  <rect
                    x={midX - 44}
                    y={y1 - 10}
                    width={88}
                    height={20}
                    rx={10}
                    fill="#e0e7ff"
                    className="dark:fill-indigo-950"
                    stroke="#818cf8"
                    strokeWidth={1}
                  />
                  <text
                    x={midX}
                    y={y1 + 3.5}
                    textAnchor="middle"
                    fill="#3730a3"
                    className="dark:fill-indigo-300 font-sans text-[9px] font-bold tracking-tight"
                  >
                    {translate("⚡ Alternatif Yol")}</text>
                </g>
              );
            })}
          </svg>

          {/* Düğüm Kartları (Node Cards) */}
          {nodes.map((pos) => {
            const isRoot = pos.node.depth === 0;
            const isAlternative = pos.node.nodeType === 'alternative_solution' || pos.node.id.startsWith('path_');
            const isAxiomatic = Boolean(pos.node.isAxiomatic);
            const isMathAxiom = pos.node.axiomType === 'mathematics';
            const isActive = pos.isActive;

            return (
              <div
                key={pos.node.id}
                data-spectrum={isAlternative ? 5 : isAxiomatic ? 3 : isRoot ? 0 : (pos.node.depth + 3) % 6}
                data-active={isActive}
                onClick={() => onSelectNode(pos.node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectNode(pos.node.id);
                  }
                }}
                className={`spectrum-tree-node absolute rounded-lg p-2 cursor-pointer transition-all duration-150 border text-left shadow-xs hover:-translate-y-0.5 animate-node-enter ${
                  isActive
                    ? 'bg-amber-100/95 dark:bg-selected border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-100 ring-2 ring-amber-400/60 shadow-amber-500/15 animate-radar-pulse'
                    : isAlternative
                    ? 'bg-indigo-50/95 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-950 dark:text-indigo-200 hover:border-indigo-500 ring-1 ring-indigo-300/40'
                    : isAxiomatic
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 hover:border-emerald-400'
                    : isRoot
                    ? 'bg-[#fcfaf4] dark:bg-stone-800/90 border-[#c4a984] text-[#1c1917] dark:text-stone-100 hover:border-amber-600'
                    : 'bg-[#fdfcf8] dark:bg-panel/90 border-[#e6decb] dark:border-stone-800 text-[#292524] dark:text-stone-300 hover:border-[#b59974] dark:hover:border-stone-600'
                }`}
                style={{
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  left: pos.x - CARD_WIDTH / 2,
                  top: pos.y - CARD_HEIGHT / 2
                }}
                title={translate("{0} katmanına geçiş yap", [translate(pos.node.label)])}
              >
                {/* Üst Kısım: İkon ve Derinlik */}
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1 min-w-0">
                    {isAlternative ? (
                      <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    ) : isRoot ? (
                      <BookOpen className="w-3 h-3 text-amber-800 dark:text-amber-400 shrink-0" />
                    ) : isAxiomatic ? (
                      <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : pos.node.contextualQuery ? (
                      <HelpCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                    ) : (
                      <FileText className="w-3 h-3 text-stone-400 dark:text-stone-500 shrink-0" />
                    )}

                    <span className="text-[9px] font-mono text-stone-400 dark:text-stone-500">
                      D{pos.node.depth}
                    </span>
                  </div>

                  {isAlternative ? (
                    <span className="text-[8px] uppercase tracking-wider font-sans font-bold bg-indigo-100 dark:bg-indigo-900/80 text-indigo-800 dark:text-indigo-300 px-1 py-0.2 rounded border border-indigo-300 dark:border-indigo-700 shrink-0">
                      {pos.node.pathMethodName || translate("2. Yol")}
                    </span>
                  ) : isAxiomatic ? (
                    <span className="text-[8px] uppercase tracking-wider font-sans font-bold bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 px-1 py-0.2 rounded border border-emerald-300 dark:border-emerald-700 shrink-0">
                      {isMathAxiom ? translate("Öklid") : translate("Aksiyom")}
                    </span>
                  ) : pos.node.targetDisplayNumber !== undefined ? (
                    <span className="text-[9px] font-mono text-stone-500 dark:text-stone-400 font-semibold shrink-0">
                      ({pos.node.targetDisplayNumber})
                    </span>
                  ) : null}
                </div>

                {/* Başlık */}
                <div className="text-[11px] font-serif font-medium leading-snug line-clamp-2">
                  {translate(pos.node.label)}
                </div>

                {/* Aktif İndikatör */}
                {isActive && (
                  <div className="absolute bottom-1 right-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Alt: Ana Çözüme Dön Butonu */}
      {currentDepth > 0 && (
        <div className="p-3 border-t border-stone-200 dark:border-stone-800 bg-stone-100/50 dark:bg-canvas shrink-0">
          <button
            type="button"
            onClick={() => onSelectNode('root')}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-sans font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/70 dark:hover:bg-stone-800 rounded transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{translate("Ana Çözüme Dön")}</span>
          </button>
        </div>
      )}
      {executionReport && <ExecutionReportPanel report={executionReport} />}
    </aside>
  );
};
