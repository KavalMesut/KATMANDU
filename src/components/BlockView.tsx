import { translate } from '../i18n';
import React from 'react';
import { SolutionBlock, EquationBlock, ExpansionLayer } from '../domain/types';
import { KaTeXRenderer } from './KaTeXRenderer';
import { SimpleDiagram } from './SimpleDiagram';
import { InlineExpansionView } from './InlineExpansionView';
import { Sparkles } from 'lucide-react';

interface BlockViewProps {
  block: SolutionBlock;
  isSelected?: boolean;
  childLayers?: ExpansionLayer[];
  isExpandingThisBlock?: boolean;
  expandingBlockId?: string | null;
  layersByTargetId?: Record<string, ExpansionLayer[]>;
  openLayerIds?: Set<string>;
  onToggleLayer?: (layerId: string) => void;
  onSelectEquation?: (equation: EquationBlock) => void;
  onFormulaClick?: (formula: string, isSingleSymbol: boolean) => void;
}

/**
 * BlockView:
 * Tekil bilimsel blok sunumu (Prose, Equation, Diagram).
 * HD-025 uyarınca her denklem bağımsız bir iddiadır ve deterministik numaraya sahiptir.
 * Yatay scrollbar çıkarılmaz; denklemler alt satıra geçerek akar.
 * Tıklanan denklemin hemen altına yerinde (inline) katman akordeonu eklenir.
 */
export const BlockView: React.FC<BlockViewProps> = ({
  block,
  isSelected = false,
  childLayers = [],
  isExpandingThisBlock = false,
  expandingBlockId = null,
  layersByTargetId = {},
  openLayerIds = new Set(),
  onToggleLayer,
  onSelectEquation,
  onFormulaClick
}) => {
  switch (block.kind) {
    case 'prose':
      return (
        <div id={block.id} data-block-id={block.id} className="my-3">
          <p className="text-[#262320] dark:text-stone-200 text-[16px] leading-[1.65] font-serif text-justify">
            <KaTeXRenderer content={block.text} onFormulaClick={onFormulaClick} />
          </p>

          {/* Bu prose bloğunun yükleme durumu */}
          {isExpandingThisBlock && (
            <div className="mt-2 ml-4 p-3 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-stone-800 dark:text-amber-200 flex items-center gap-2.5 animate-pulse text-xs font-serif">
              <Sparkles className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400 shrink-0" />
              <span>{translate("Ayrıntılı türetim katmanı derleniyor...")}</span>
            </div>
          )}

          {/* Bu prose bloğuna ait yerinde türetim katmanları */}
          {childLayers.map((layer) => (
            <InlineExpansionView
              key={layer.id}
              layer={layer}
              isOpen={openLayerIds.has(layer.id)}
              onToggle={() => onToggleLayer?.(layer.id)}
              selectedEquationId={isSelected ? block.id : undefined}
              expandingBlockId={expandingBlockId}
              layersByTargetId={layersByTargetId}
              openLayerIds={openLayerIds}
              onToggleLayer={onToggleLayer || (() => {})}
              onSelectEquation={onSelectEquation}
              onFormulaClick={onFormulaClick}
            />
          ))}
        </div>
      );

    case 'equation': {
      const isClickable = block.expandable !== false && Boolean(onSelectEquation);

      return (
        <div id={block.id} data-block-id={block.id} className="my-3">
          <div
            onDoubleClick={() => {
              if (isClickable && onSelectEquation) {
                onSelectEquation(block);
              }
            }}
            className={`group relative py-2.5 px-4 rounded-r transition-all duration-150 flex items-center justify-between border-l-3 ${
              isSelected
                ? 'bg-[#f4ede0] dark:bg-amber-950/40 border-l-[#78350f] dark:border-l-amber-500 border-y border-r border-[#dfd4be] dark:border-amber-800 shadow-xs'
                : isClickable
                ? 'border-l-transparent hover:border-l-[#854d0e] dark:hover:border-l-amber-400 hover:bg-[#f7f2e6]/90 dark:hover:bg-stone-800/60 hover:shadow-2xs cursor-pointer'
                : 'border-l-transparent'
            }`}
            title={isClickable ? translate("Bu denklemin analitik türetimini yerinde açmak için çift tıklayın") : undefined}
          >
            {/* Sol: Denklem Alanı (Taşmasız & Çok Satırlı Sarmalamalı) */}
            <div className="flex-1 flex justify-center py-1 min-w-0 max-w-full">
              <KaTeXRenderer content={block.latex} block={true} />
            </div>

            {/* Sağ: Deterministik Denklem Numarası (1), (2)... */}
            {block.displayNumber !== undefined && (
              <div className="ml-4 pl-2 shrink-0 select-none text-[#8c7e72] dark:text-stone-400 font-serif text-sm tracking-wide">
                <span>({block.displayNumber})</span>
              </div>
            )}
          </div>

          {isClickable && <button type="button" className="touch-derivation-control text-xs font-sans text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded px-3 py-2"
            disabled={isExpandingThisBlock}
            onDoubleClick={event => event.stopPropagation()}
            onClick={() => onSelectEquation?.(block)}>
            <Sparkles className="w-3.5 h-3.5" />{translate("Türetimi aç")}
          </button>}

          {/* Bu denklemin yerinde yükleme durumu */}
          {isExpandingThisBlock && (
            <div className="my-2.5 p-3.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-stone-800 dark:text-amber-200 flex items-center gap-3 animate-pulse text-xs font-serif shadow-2xs">
              <Sparkles className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold block font-sans uppercase tracking-wider text-[11px] text-amber-900 dark:text-amber-300">
                  {translate("Analitik Türetim Katmanı Derleniyor")}</span>
                <span>
                  {block.displayNumber !== undefined
                    ? translate("Denklem ({0}) için analitik türetim ve ilk ilkeler derleniyor...", [block.displayNumber])
                    : translate("Analitik türetim ve ilk ilkeler derleniyor...")}
                </span>
              </div>
            </div>
          )}

          {/* Bu denkleme ait yerinde (inline) türetim katmanları */}
          {childLayers.map((layer) => (
            <InlineExpansionView
              key={layer.id}
              layer={layer}
              isOpen={openLayerIds.has(layer.id)}
              onToggle={() => onToggleLayer?.(layer.id)}
              selectedEquationId={isSelected ? block.id : undefined}
              expandingBlockId={expandingBlockId}
              layersByTargetId={layersByTargetId}
              openLayerIds={openLayerIds}
              onToggleLayer={onToggleLayer || (() => {})}
              onSelectEquation={onSelectEquation}
              onFormulaClick={onFormulaClick}
            />
          ))}
        </div>
      );
    }

    case 'diagram':
      return <SimpleDiagram spec={block.spec} />;

    default:
      return null;
  }
};
