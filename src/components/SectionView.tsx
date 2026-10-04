import { containsConcept } from '../i18n/concepts';
import { translate } from '../i18n';
import React from 'react';
import { SolutionSection, EquationBlock, AdvancedVerificationOption, ExpansionLayer } from '../domain/types';
import { cleanSectionTitle } from '../domain/trustedAssembler';
import { BlockView } from './BlockView';
import { InlineExpansionView } from './InlineExpansionView';
import { ClipboardList, Sparkles, ExternalLink } from 'lucide-react';

interface SectionViewProps {
  section: SolutionSection;
  sectionIndex: number;
  selectedEquationId?: string;
  advancedChecks?: AdvancedVerificationOption[];
  layersByTargetId?: Record<string, ExpansionLayer[]>;
  openLayerIds?: Set<string>;
  expandingBlockId?: string | null;
  onToggleLayer?: (layerId: string) => void;
  onSelectEquation?: (equation: EquationBlock) => void;
  onFormulaClick?: (formula: string, isSingleSymbol: boolean) => void;
  onContextualInquire?: (selectedText: string, customQuery?: string) => void;
}

/**
 * SectionView:
 * Klasik bir akademik makalenin alt bölümünü render eder.
 */
export const SectionView: React.FC<SectionViewProps> = ({
  section,
  sectionIndex,
  selectedEquationId,
  advancedChecks,
  layersByTargetId = {},
  openLayerIds = new Set(),
  expandingBlockId = null,
  onToggleLayer,
  onSelectEquation,
  onFormulaClick,
  onContextualInquire
}) => {
  const isVerification =
    containsConcept(section.title.toLowerCase(), 'sağlama') ||
    containsConcept(section.title.toLowerCase(), 'doğruluk') ||
    containsConcept(section.title.toLowerCase(), 'boyut analizi') ||
    containsConcept(section.title.toLowerCase(), 'limit durum');

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-spectrum={sectionIndex % 6}
      className={`spectrum-section my-8 page-break-avoid ${
        isVerification
          ? 'p-5 rounded-md bg-stone-50/70 dark:bg-stone-900/40 border border-amber-500/30 dark:border-amber-500/20 shadow-2xs'
          : ''
      }`}
    >
      <h2 className="text-xl font-serif font-semibold text-[#1c1917] dark:text-stone-100 border-b border-[#e6decb] dark:border-stone-800 pb-1.5 mb-4 tracking-tight flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          {!/^\s*(?:\([a-zçğıöşü]\)|[a-zçğıöşü][).])\s+/i.test(section.title) && (
            <span className="text-[#8c7e72] dark:text-stone-400 text-sm font-sans font-normal">
              {sectionIndex + 1}.
            </span>
          )}
          <span>{cleanSectionTitle(section.title)}</span>
        </div>
        {isVerification && (
          <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-0.5 rounded border border-amber-300 dark:border-amber-800">
            <ClipboardList className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>{translate("Sağlama Açıklaması · Kontrol edilmedi")}</span>
          </span>
        )}
      </h2>

      <div className="space-y-2">
        {section.blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            isSelected={block.id === selectedEquationId}
            childLayers={layersByTargetId[block.id] || []}
            isExpandingThisBlock={expandingBlockId === block.id}
            expandingBlockId={expandingBlockId}
            layersByTargetId={layersByTargetId}
            openLayerIds={openLayerIds}
            onToggleLayer={onToggleLayer}
            onSelectEquation={onSelectEquation}
            onFormulaClick={onFormulaClick}
          />
        ))}
      </div>

      {/* Bölüm Düzeyinde Açılan Yerinde Türetim Katmanları */}
      {(layersByTargetId[section.id] || []).map((layer) => (
        <InlineExpansionView
          key={layer.id}
          layer={layer}
          isOpen={openLayerIds.has(layer.id)}
          onToggle={() => onToggleLayer?.(layer.id)}
          selectedEquationId={selectedEquationId}
          expandingBlockId={expandingBlockId}
          layersByTargetId={layersByTargetId}
          openLayerIds={openLayerIds}
          onToggleLayer={onToggleLayer || (() => {})}
          onSelectEquation={onSelectEquation}
          onFormulaClick={onFormulaClick}
        />
      ))}

      {/* İleri Düzey Derinleştirme Sağlamaları (İsteğe Bağlı & Tıklanabilir Rozetler) */}
      {isVerification && advancedChecks && advancedChecks.length > 0 && (
        <div className="mt-7 pt-5 border-t border-amber-500/20 dark:border-amber-500/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-sans font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{translate("İleri Düzey Derinleştirme Sağlamaları (İsteğe Bağlı)")}</span>
            </div>
            <span className="text-[11px] font-sans text-stone-500 dark:text-stone-400 hidden sm:inline">
              {translate("Tıklanabilir Analitik Katmanlar")}</span>
          </div>
          <p className="text-xs text-stone-600 dark:text-stone-400 mb-3.5 font-serif leading-relaxed">
            {translate("Varsayılan raporda sadeliği korumak amacıyla ana metne özet olarak bırakılan diğer analitik ve kurucu yöntemler. Başlıklardan birine tıklayarak ilgili yöntemin tam türetim katmanına doğrudan dallanabilirsiniz:")}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {advancedChecks.map((check) => (
              <button
                key={check.id}
                type="button"
                onClick={() => onContextualInquire?.(check.title, check.query)}
                className="text-left p-3.5 rounded-lg border border-amber-500/25 dark:border-amber-500/20 bg-white/90 dark:bg-stone-800/80 hover:bg-amber-50/80 dark:hover:bg-amber-950/50 hover:border-amber-400 dark:hover:border-amber-500 transition-all shadow-2xs hover:shadow-xs group flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="inline-flex items-center text-[11px] font-sans font-medium px-2 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                      {check.badge}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" />
                  </div>
                  <h4 className="text-xs font-sans font-semibold text-stone-900 dark:text-stone-100 group-hover:text-amber-700 dark:group-hover:text-amber-300 mb-1.5 transition-colors leading-snug">
                    {check.title}
                  </h4>
                  <p className="text-[11px] font-serif text-stone-600 dark:text-stone-400 leading-snug line-clamp-3">
                    {check.description}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-stone-100 dark:border-stone-700/50 flex items-center justify-between text-[11px] font-sans font-medium text-amber-700 dark:text-amber-400 group-hover:underline">
                  <span>{translate("İspatı İncele")}</span>
                  <span>&rarr;</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
