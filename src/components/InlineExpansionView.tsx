import { translate } from '../i18n';
import React from 'react';
import { ExpansionLayer, EquationBlock, SolutionBlock } from '../domain/types';
import { KaTeXRenderer } from './KaTeXRenderer';
import { SimpleDiagram } from './SimpleDiagram';
import {
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  HelpCircle,
  Sparkles
} from 'lucide-react';

export interface DepthPalette {
  lightBg: string;
  lightBorder: string;
  lightHeader: string;
  lightBadgeBg: string;
  lightBadgeText: string;
  lightAccent: string;
  darkBg: string;
  darkBorder: string;
  darkHeader: string;
  darkBadgeBg: string;
  darkBadgeText: string;
  darkAccent: string;
}

export function getDepthPalette(depth: number): DepthPalette {
  switch (depth) {
    case 1:
      return {
        lightBg: 'bg-[#fef9ee]',
        lightBorder: 'border-[#d97706]/60',
        lightHeader: 'bg-[#fde68a]/70 hover:bg-[#fde68a]/90',
        lightBadgeBg: 'bg-[#fbbf24]',
        lightBadgeText: 'text-[#78350f]',
        lightAccent: 'text-[#92400e]',
        darkBg: 'dark:bg-panel',
        darkBorder: 'dark:border-spectrum-blue/40',
        darkHeader: 'dark:bg-stone-800/70 dark:hover:bg-stone-800',
        darkBadgeBg: 'dark:bg-stone-800',
        darkBadgeText: 'dark:text-spectrum-blue',
        darkAccent: 'dark:text-spectrum-blue'
      };
    case 2:
      return {
        lightBg: 'bg-[#f0f5fa]',
        lightBorder: 'border-[#cde0ee]',
        lightHeader: 'bg-[#e1edf7]/85 hover:bg-[#d2e4f3]',
        lightBadgeBg: 'bg-[#c5e0f5]',
        lightBadgeText: 'text-[#1e40af]',
        lightAccent: 'text-[#2563eb]',
        darkBg: 'dark:bg-panel',
        darkBorder: 'dark:border-spectrum-green/40',
        darkHeader: 'dark:bg-stone-800/70 dark:hover:bg-stone-800',
        darkBadgeBg: 'dark:bg-stone-800',
        darkBadgeText: 'dark:text-spectrum-green',
        darkAccent: 'dark:text-spectrum-green'
      };
    case 3:
      return {
        lightBg: 'bg-[#eff8f3]',
        lightBorder: 'border-[#c7ebd7]',
        lightHeader: 'bg-[#def3e7]/85 hover:bg-[#cfeada]',
        lightBadgeBg: 'bg-[#bde8d1]',
        lightBadgeText: 'text-[#065f46]',
        lightAccent: 'text-[#059669]',
        darkBg: 'dark:bg-panel',
        darkBorder: 'dark:border-spectrum-violet/40',
        darkHeader: 'dark:bg-stone-800/70 dark:hover:bg-stone-800',
        darkBadgeBg: 'dark:bg-stone-800',
        darkBadgeText: 'dark:text-spectrum-violet',
        darkAccent: 'dark:text-spectrum-violet'
      };
    default:
      return {
        lightBg: 'bg-[#f8f3fa]',
        lightBorder: 'border-[#e3cfee]',
        lightHeader: 'bg-[#ede1f5]/85 hover:bg-[#dfcbee]',
        lightBadgeBg: 'bg-[#dfc5f2]',
        lightBadgeText: 'text-[#581c87]',
        lightAccent: 'text-[#7e22ce]',
        darkBg: 'dark:bg-panel',
        darkBorder: 'dark:border-spectrum-pink/40',
        darkHeader: 'dark:bg-stone-800/70 dark:hover:bg-stone-800',
        darkBadgeBg: 'dark:bg-stone-800',
        darkBadgeText: 'dark:text-spectrum-pink',
        darkAccent: 'dark:text-spectrum-pink'
      };
  }
}

interface InlineExpansionViewProps {
  layer: ExpansionLayer;
  isOpen: boolean;
  onToggle: () => void;
  selectedEquationId?: string;
  expandingBlockId?: string | null;
  layersByTargetId: Record<string, ExpansionLayer[]>;
  openLayerIds: Set<string>;
  onToggleLayer: (layerId: string) => void;
  onSelectEquation?: (equation: EquationBlock) => void;
  onFormulaClick?: (formula: string, isSingleSymbol: boolean) => void;
}

export const InlineExpansionView: React.FC<InlineExpansionViewProps> = ({
  layer,
  isOpen,
  onToggle,
  selectedEquationId,
  expandingBlockId,
  layersByTargetId,
  openLayerIds,
  onToggleLayer,
  onSelectEquation,
  onFormulaClick
}) => {
  const palette = getDepthPalette(layer.depth);

  const renderInnerBlock = (block: SolutionBlock) => {
    switch (block.kind) {
      case 'prose': {
        const childLayers = layersByTargetId[block.id] || [];
        const isCurrentlyExpanding = expandingBlockId === block.id;

        return (
          <div
            key={block.id}
            id={block.id}
            data-block-id={block.id}
            data-layer-id={layer.id}
            className="my-2.5"
          >
            <p className="text-[#2b261f] dark:text-stone-200 text-[15px] leading-[1.65] font-serif text-justify">
              <KaTeXRenderer content={block.text} onFormulaClick={onFormulaClick} />
            </p>

            {/* Bu prose bloğu için yükleme durumu */}
            {isCurrentlyExpanding && (
              <div className="mt-2 ml-4 p-3 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-stone-800 dark:text-amber-200 flex items-center gap-2.5 animate-pulse text-xs font-serif">
                <Sparkles className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400 shrink-0" />
                <span>{translate("Derinleşme katmanı (Seviye")} {layer.depth + 1}{translate(") derleniyor...")}</span>
              </div>
            )}

            {/* Bu prose bloğuna ait yerinde açılan alt katmanlar */}
            {childLayers.map((childLayer) => (
              <div key={childLayer.id} className="mt-2 ml-2 sm:ml-4">
                <InlineExpansionView
                  layer={childLayer}
                  isOpen={openLayerIds.has(childLayer.id)}
                  onToggle={() => onToggleLayer(childLayer.id)}
                  selectedEquationId={selectedEquationId}
                  expandingBlockId={expandingBlockId}
                  layersByTargetId={layersByTargetId}
                  openLayerIds={openLayerIds}
                  onToggleLayer={onToggleLayer}
                  onSelectEquation={onSelectEquation}
                  onFormulaClick={onFormulaClick}
                />
              </div>
            ))}
          </div>
        );
      }

      case 'equation': {
        const isClickable = block.expandable !== false && Boolean(onSelectEquation);
        const childLayers = layersByTargetId[block.id] || [];
        const isCurrentlyExpanding = expandingBlockId === block.id;

        return (
          <div
            key={block.id}
            id={block.id}
            data-block-id={block.id}
            data-layer-id={layer.id}
            className="my-3"
          >
            <div
              onDoubleClick={() => {
                if (isClickable && onSelectEquation) {
                  onSelectEquation(block);
                }
              }}
              className={`group relative py-2 px-3 rounded-r transition-all duration-150 flex items-center justify-between border-l-3 ${
                block.id === selectedEquationId
                  ? 'bg-white/80 dark:bg-stone-800/80 border-l-[#78350f] dark:border-l-amber-500 shadow-2xs'
                  : isClickable
                  ? 'border-l-transparent hover:border-l-[#854d0e] dark:hover:border-l-amber-400 hover:bg-white/60 dark:hover:bg-stone-800/50 cursor-pointer'
                  : 'border-l-transparent'
              }`}
              title={isClickable ? translate("Bu denklemin alt türetimini yerinde açmak için çift tıklayın") : undefined}
            >
              <div className="flex-1 flex justify-center py-1 min-w-0 max-w-full">
                <KaTeXRenderer content={block.latex} block={true} />
              </div>

              {block.displayNumber !== undefined && (
                <div className="ml-3 pl-2 shrink-0 select-none text-stone-500 dark:text-stone-400 font-serif text-xs">
                  <span>({block.displayNumber})</span>
                </div>
              )}
            </div>

            {isClickable && <button type="button" className="touch-derivation-control text-xs font-sans text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded px-3 py-2"
              disabled={isCurrentlyExpanding}
              onDoubleClick={event => event.stopPropagation()}
              onClick={() => onSelectEquation?.(block)}>
              <Sparkles className="w-3.5 h-3.5" />{translate("Türetimi aç")}
            </button>}

            {/* Bu alt denklemin yükleme durumu */}
            {isCurrentlyExpanding && (
              <div className="mt-2 ml-4 p-3 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-stone-800 dark:text-amber-200 flex items-center gap-2.5 animate-pulse text-xs font-serif">
                <Sparkles className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400 shrink-0" />
                <span>{translate("Derinleşme katmanı (Seviye")} {layer.depth + 1}{translate(") derleniyor...")}</span>
              </div>
            )}

            {/* Bu alt denkleme ait özyineli (recursive) iç katmanlar */}
            {childLayers.map((childLayer) => (
              <div key={childLayer.id} className="mt-2 ml-2 sm:ml-4">
                <InlineExpansionView
                  layer={childLayer}
                  isOpen={openLayerIds.has(childLayer.id)}
                  onToggle={() => onToggleLayer(childLayer.id)}
                  selectedEquationId={selectedEquationId}
                  expandingBlockId={expandingBlockId}
                  layersByTargetId={layersByTargetId}
                  openLayerIds={openLayerIds}
                  onToggleLayer={onToggleLayer}
                  onSelectEquation={onSelectEquation}
                  onFormulaClick={onFormulaClick}
                />
              </div>
            ))}
          </div>
        );
      }

      case 'diagram':
        return (
          <div
            key={block.id}
            id={block.id}
            data-block-id={block.id}
            data-layer-id={layer.id}
            className="my-4"
          >
            <SimpleDiagram spec={block.spec} />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      id={layer.id}
      data-layer-id={layer.id}
      data-layer-depth={layer.depth}
      className={`my-3 rounded-lg border transition-all duration-200 shadow-2xs overflow-hidden ${
        palette.lightBorder
      } ${palette.darkBorder} ${palette.lightBg} ${palette.darkBg} ${
        layer.isAxiomatic
          ? 'ring-1 ring-emerald-500/40 dark:ring-emerald-500/30'
          : ''
      }`}
    >
      {/* Sekme Butonu (Header Tab / Accordion Toggle) */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 border-b transition-colors cursor-pointer select-none ${
          palette.lightHeader
        } ${palette.darkHeader} ${
          isOpen
            ? `${palette.lightBorder} ${palette.darkBorder}`
            : 'border-transparent'
        }`}
        title={isOpen ? translate("Katmanı Daralt") : translate("Katmanı Genişlet")}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 text-stone-500 dark:text-stone-400">
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </span>

          {/* Derinlik Rozeti */}
          <span
            className={`text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
              palette.lightBadgeBg
            } ${palette.lightBadgeText} ${palette.darkBadgeBg} ${
              palette.darkBadgeText
            }`}
          >
            {translate("Katman Derinliği")}{layer.depth}
          </span>

          {/* Katman Başlığı */}
          <span className="font-serif font-semibold text-sm text-[#1c1917] dark:text-stone-100 truncate">
            {layer.title}
          </span>

          {/* Kaynak Denklem veya Soru */}
          {layer.targetDisplayNumber !== undefined ? (
            <span className="hidden sm:inline text-xs font-serif italic text-stone-500 dark:text-stone-400 shrink-0">
              {translate("Denklem (")}{layer.targetDisplayNumber}{translate(") için türetim")}</span>
          ) : layer.contextualQuery ? (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-sans text-stone-500 dark:text-stone-400 truncate">
              <HelpCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">"{layer.contextualQuery}"</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Aksiyom Rozeti */}
          {layer.isAxiomatic && (
            <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
              <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">{translate("Aksiyom")}</span>
            </span>
          )}

          <span className="text-[11px] font-sans font-medium text-stone-500 dark:text-stone-400">
            {isOpen ? translate("Kapat") : translate("Aç")}
          </span>
        </div>
      </button>

      {/* Açılır / Kapanır Gövde */}
      {isOpen && (
        <div className="inline-expansion-body p-4 sm:p-5 text-[#231f1c] dark:text-stone-100 animate-fade-in space-y-2">
          {/* Eğer bir bağlamsal sorgu varsa üstte göster */}
          {layer.contextualQuery && (
            <div className="mb-3 px-3 py-1.5 rounded bg-white/70 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-700/60 text-xs font-serif italic text-stone-700 dark:text-stone-300">
              {translate("Sorgulanan İfade / Açıklama: \"")}{layer.contextualQuery}"
            </div>
          )}

          {/* Katmanın Çözüm Blokları */}
          <div>{layer.blocks.map((block) => renderInnerBlock(block))}</div>

          {/* Bu katmanın geneline yönelik açılan alt katmanlar (varsa) */}
          {(layersByTargetId[layer.id] || []).length > 0 && (
            <div className="mt-4 pt-3 border-t border-stone-200/60 dark:border-stone-800/60 space-y-3">
              {(layersByTargetId[layer.id] || []).map((childLayer) => (
                <div key={childLayer.id} className="ml-2 sm:ml-4">
                  <InlineExpansionView
                    layer={childLayer}
                    isOpen={openLayerIds.has(childLayer.id)}
                    onToggle={() => onToggleLayer(childLayer.id)}
                    selectedEquationId={selectedEquationId}
                    expandingBlockId={expandingBlockId}
                    layersByTargetId={layersByTargetId}
                    openLayerIds={openLayerIds}
                    onToggleLayer={onToggleLayer}
                    onSelectEquation={onSelectEquation}
                    onFormulaClick={onFormulaClick}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Bu katmanın geneline yönelik yükleme durumu */}
          {expandingBlockId === layer.id && (
            <div className="mt-3 ml-4 p-3 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-stone-800 dark:text-amber-200 flex items-center gap-2.5 animate-pulse text-xs font-serif">
              <Sparkles className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400 shrink-0" />
              <span>{translate("Derinleşme katmanı (Seviye")} {layer.depth + 1}{translate(") derleniyor...")}</span>
            </div>
          )}

          {/* Aksiyom Bilgilendirme Kutusu */}
          {layer.isAxiomatic && (
            <div className="mt-4 p-3.5 rounded-lg bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300/80 dark:border-emerald-700 text-xs font-serif text-emerald-950 dark:text-emerald-200 leading-relaxed">
              <div className="flex items-center gap-1.5 font-sans font-bold uppercase tracking-wider text-[11px] text-emerald-800 dark:text-emerald-300 mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {layer.axiomType === 'mathematics'
                    ? translate("Aksiyomatik Düzeye Ulaşıldı (Formel Matematik / Geometrik Postulat)")
                    : translate("Kurucu Doğa Yasası (Fiziksel Aksiyom)")}
                </span>
              </div>
              <p>
                {layer.axiomType === 'mathematics'
                  ? translate("Bu ilke, Öklid geometrisinin ve formel mantığın kurucu aksiyomudur (postulat). Düzlem uzay kabulleri altında mantıksal olarak daha ilksel bir ilkeden türetilemez; tüm geometrik bağıntılar bu aksiyomatik temel üzerine inşa edilir.")
                  : translate("Bu ilke, klasik fiziğin doğrudan deney ve gözlemle doğrulanmış kurucu doğa yasasıdır. Matematiksel olarak daha ilksel bir ilkeden türetilemez.")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
