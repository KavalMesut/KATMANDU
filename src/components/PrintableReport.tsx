import { containsConcept } from '../i18n/concepts';
import { getLocale } from '../i18n';
import { translate } from '../i18n';
import { getVerificationNotice } from '../domain/verification';
import React, { useMemo } from 'react';
import { SolutionDocument, ExpansionLayer, SolutionBlock } from '../domain/types';
import { cleanSectionTitle } from '../domain/trustedAssembler';
import { KaTeXRenderer } from './KaTeXRenderer';
import { SimpleDiagram } from './SimpleDiagram';
import { BookOpen, ShieldCheck, ClipboardList } from 'lucide-react';

export interface PrintableDocumentItem {
  document: SolutionDocument;
  layers: ExpansionLayer[];
  maxDepth: number;
}

interface PrintableReportProps {
  document?: SolutionDocument;
  layers?: ExpansionLayer[];
  maxDepth?: number;
  documents?: PrintableDocumentItem[];
}

interface SinglePrintableProblemProps {
  item: PrintableDocumentItem;
  index?: number;
  total?: number;
}

/**
 * Tek bir problemin A4 baskı şablonu
 */
const SinglePrintableProblem: React.FC<SinglePrintableProblemProps> = ({
  item,
  index,
  total
}) => {
  const { document, layers, maxDepth } = item;
  const safeSections = document.sections || [];
  const safeLayers = layers || [];

  // Katmanları hedef aldıkları blok kimliğine (targetBlockId) göre grupla
  const { layersByTargetId, renderedLayerIds } = useMemo(() => {
    const map: Record<string, ExpansionLayer[]> = {};
    for (const layer of safeLayers) {
      if (layer && layer.depth <= maxDepth) {
        const key = layer.targetBlockId || 'root';
        if (!map[key]) map[key] = [];
        map[key].push(layer);
      }
    }
    return { layersByTargetId: map, renderedLayerIds: new Set<string>() };
  }, [safeLayers, maxDepth]);

  // Derinlik bazlı baskı stil sınıfı
  const getPrintDepthStyle = (depth: number, isAxiomatic?: boolean) => {
    if (isAxiomatic) {
      return 'border-emerald-800 bg-emerald-50/50';
    }
    switch (depth) {
      case 1:
        return 'border-[#d97706]/70 bg-[#fef9ee]';
      case 2:
        return 'border-[#7ba4c9] bg-[#f5f9fc]';
      case 3:
        return 'border-[#71ba94] bg-[#f4faf7]';
      default:
        return 'border-[#b592cf] bg-[#faf6fc]';
    }
  };

  const getPrintBadgeStyle = (depth: number, isAxiomatic?: boolean) => {
    if (isAxiomatic) {
      return 'bg-emerald-100 text-emerald-950 border-emerald-400';
    }
    switch (depth) {
      case 1:
        return 'bg-[#fde68a] text-[#78350f] border-[#d97706]/60';
      case 2:
        return 'bg-[#d2e4f5] text-[#12396b] border-[#a5c7eb]';
      case 3:
        return 'bg-[#cbebd9] text-[#094d2c] border-[#9ed9b6]';
      default:
        return 'bg-[#edd8f8] text-[#4d136b] border-[#d8b5ec]';
    }
  };

  // Yerinde türetim katmanı renderı
  const renderPrintableLayer = (layer: ExpansionLayer) => {
    renderedLayerIds.add(layer.id);
    const depthStyle = getPrintDepthStyle(layer.depth, layer.isAxiomatic);
    const badgeStyle = getPrintBadgeStyle(layer.depth, layer.isAxiomatic);

    return (
      <div
        key={layer.id}
        className={`my-2 p-2.5 border rounded print-layer-container ${depthStyle}`}
      >
        <div className="flex items-center justify-between mb-1 pb-1 border-b border-stone-300 break-after-avoid page-break-after-avoid">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeStyle}`}
            >
              {translate("Katman Derinliği")}{layer.depth}
            </span>
            <span className="font-serif font-bold text-sm text-black">
              {layer.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {layer.isAxiomatic && (
              <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold uppercase tracking-wide text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-400">
                <ShieldCheck className="w-3 h-3 text-emerald-700" />
                <span>{translate("Aksiyom")}</span>
              </span>
            )}
            {layer.targetDisplayNumber !== undefined && (
              <span className="text-xs font-serif italic text-stone-700">
                {translate("Denklem (")}{layer.targetDisplayNumber}{translate(") için türetim")}</span>
            )}
          </div>
        </div>

        {layer.contextualQuery && (
          <div className="text-[11px] font-serif italic text-stone-600 mb-1.5">
            {translate("Sorgulanan İfade / Açıklama: \"")}{layer.contextualQuery}"
          </div>
        )}

        <div className="space-y-1">
          {layer.blocks.map((b) => renderBlock(b))}
        </div>

        {/* Bu katmanın geneline yönelik açılan alt katmanlar */}
        {(layersByTargetId[layer.id] || []).map((childLayer) => renderPrintableLayer(childLayer))}

        {layer.isAxiomatic && (
          <div className="mt-2 p-2 bg-emerald-50 border border-emerald-400 rounded text-emerald-950 text-[11px] font-serif page-break-avoid">
            <span className="font-bold font-sans uppercase text-[10px] block mb-0.5">
              {layer.axiomType === 'mathematics'
                ? translate("Aksiyomatik Düzey (Öklid Geometrisi / Formel Postulat)")
                : translate("Kurucu Doğa Yasası (Fiziksel Aksiyom)")}
            </span>
            {layer.axiomType === 'mathematics'
              ? translate("Bu ilke formel matematiğin kurucu aksiyomudur; daha ilksel bir ilkeden türetilemez.")
              : translate("Bu ilke klasik mekaniğin deneyle doğrulanmış kurucu doğa yasasıdır; matematiksel olarak daha ilksel bir ilkeden türetilemez.")}
          </div>
        )}
      </div>
    );
  };

  const renderBlock = (block: SolutionBlock) => {
    switch (block.kind) {
      case 'prose': {
        const childLayers = layersByTargetId[block.id] || [];
        return (
          <div key={block.id} className="mb-1.5 text-[13.5px] font-serif leading-snug text-black print-prose">
            <KaTeXRenderer content={block.text} />
            {childLayers.map((layer) => renderPrintableLayer(layer))}
          </div>
        );
      }

      case 'equation': {
        const childLayers = layersByTargetId[block.id] || [];

        return (
          <div key={block.id} className="my-1.5">
            <div className="equation-box page-break-avoid py-0.5">
              {block.explanation && (
                <div className="text-xs font-serif italic text-stone-700 mb-0.5">
                  {block.explanation}:
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex-1 flex justify-center">
                  <KaTeXRenderer content={block.latex} block={true} />
                </div>
                {block.displayNumber !== undefined && (
                  <span className="text-xs font-serif font-semibold text-stone-900 ml-3 shrink-0">
                    ({block.displayNumber})
                  </span>
                )}
              </div>
            </div>

            {/* Bu denklemin altına yerinde (in-place) basılan türetim katmanları */}
            {childLayers.map((layer) => renderPrintableLayer(layer))}
          </div>
        );
      }

      case 'diagram':
        return (
          <div key={block.id} className="my-2.5 page-break-avoid flex flex-col items-center">
            <SimpleDiagram spec={block.spec} />
          </div>
        );

      default:
        return null;
    }
  };

  const meta = document.metadata || {
    providerName: translate("KATMANDU Bilimsel Çıkarım Sistemi"),
    modelName: 'Kanonik Model',
    solvedAt: Date.now()
  };

  const formattedDate = new Date(meta.solvedAt || Date.now()).toLocaleDateString(getLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const headerLabel =
    index !== undefined && total !== undefined
      ? translate("KATMANDU Çoklu Problem Çözüm Raporu ({0} / {1})", [index, total])
      : translate("KATMANDU Bilimsel Çözüm Raporu");
  const problemPrefix = index !== undefined ? `Problem ${index}: ` : '';

  return (
    <div className="single-problem-print-container mb-4">
      {/* 1. Akademik Başlık ve AI Model Künyesi */}
      <div className="border-b border-black pb-2 mb-3 text-center">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-sans font-bold text-stone-700 mb-0.5">
          <BookOpen className="w-3.5 h-3.5" />
          <span>{headerLabel}</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-black font-serif my-0.5">
          {problemPrefix}{document.problemTitle}
        </h1>

        {/* Model Künyesi & Çözüm Tarihi */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-xs font-sans text-stone-800">
          <span className="font-mono font-medium text-stone-900">
            Model: {meta.modelName}
          </span>
          <span className="text-stone-400">•</span>
          <span className="font-medium text-stone-800">
            {translate("Tarih:")}{formattedDate}
          </span>
        </div>
      </div>

      {/* 2. Problem Bölümü */}
      <div className="mb-2.5 p-2.5 border border-stone-400 rounded bg-stone-50/70">
        <div className="text-xs font-sans font-bold uppercase tracking-wider text-black mb-1 border-b border-stone-300 pb-0.5 flex items-center justify-between">
          <span>{index !== undefined ? `PROBLEM ${index}` : 'PROBLEM'}</span>
          <span className="text-[10px] font-normal text-stone-500 font-serif lowercase">{translate("orijinal problem metni")}</span>
        </div>
        <div className="italic text-[13.5px] mb-1.5 leading-snug text-stone-900 print-prose">
          <KaTeXRenderer
            content={document.problemText || translate("Problem doküman üzerinden çözümlenmiştir.")}
          />
        </div>

        {document.problemDiagram && (
          <div className="my-2 flex justify-center page-break-avoid">
            <SimpleDiagram spec={document.problemDiagram} />
          </div>
        )}

        {/* Ekli Orijinal Soru Görseli */}
        {document.attachments &&
          document.attachments.some((a) => a.type === 'image' && a.dataUrl) && (
            <div className="mt-1.5 pt-1.5 border-t border-stone-200">
              <span className="text-[10px] font-sans font-semibold uppercase text-stone-600 block mb-1">
                {translate("Orijinal Soru Görseli:")}</span>
              <div className="flex flex-wrap gap-2.5 justify-center">
                {document.attachments
                  .filter((a) => a.type === 'image' && a.dataUrl)
                  .map((att) => (
                    <div key={att.id} className="p-1 border border-stone-300 max-w-xs bg-white page-break-avoid">
                      <img src={att.dataUrl} alt={att.name} className="max-h-36 object-contain mx-auto" />
                    </div>
                  ))}
              </div>
            </div>
          )}
      </div>

      {/* 3. Çözüm Stratejisi ve Varsayımlar */}
      <p className="mb-4 text-sm" role="note">{getVerificationNotice(document)}</p>

      {(document.strategy || (document.assumptions && document.assumptions.length > 0)) && (
        <div className="mb-3 pb-1.5 border-b border-stone-300 text-xs">
          {document.strategy && (
            <div className="mb-1">
              <span className="font-sans font-bold uppercase tracking-wide text-black mr-1.5">
                {translate("Çözüm Stratejisi:")}</span>
              <span className="font-serif leading-normal text-stone-900">
                <KaTeXRenderer content={document.strategy} />
              </span>
            </div>
          )}

          {document.assumptions && document.assumptions.length > 0 && (
            <div>
              <span className="font-sans font-bold uppercase tracking-wide text-black mr-1.5">
                {translate("Model Varsayımları:")}</span>
              <span className="font-serif text-stone-800">
                {document.assumptions.join(' • ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 4. Ana Çözüm Bölümleri ve Yerinde Türetimler */}
      <div className="space-y-2.5">
        {safeSections.map((section, sIdx) => {
          const isVerification =
            containsConcept((section?.title || '').toLowerCase(), 'sağlama') ||
            containsConcept((section?.title || '').toLowerCase(), 'doğruluk') ||
            containsConcept((section?.title || '').toLowerCase(), 'boyut analizi') ||
            containsConcept((section?.title || '').toLowerCase(), 'limit durum');

          const sectionLayers = layersByTargetId[section?.id || ''] || [];

          return (
            <div
              key={section?.id || sIdx}
              className={`${
                isVerification
                  ? 'p-2.5 border border-stone-400 rounded bg-stone-50/50 mt-3'
                  : 'mb-2.5'
              }`}
            >
              <div className="flex items-center justify-between border-b border-stone-300 pb-1 mb-2 break-after-avoid page-break-after-avoid">
                <h2 className="text-base font-bold text-black font-serif">
                  {sIdx + 1}. {cleanSectionTitle(section?.title || '')}
                </h2>
                {isVerification && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold uppercase tracking-wide text-black border border-stone-600 px-1.5 py-0.5 rounded">
                    <ClipboardList className="w-3 h-3 text-black" />
                    <span>{translate("Sağlama Açıklaması · Kontrol edilmedi")}</span>
                  </span>
                )}
              </div>

              {/* Bloklar ve Denklemlerin Altındaki Yerinde Türetimler */}
              <div className="space-y-1">
                {(section?.blocks || []).map((b) => renderBlock(b))}
              </div>

              {/* Bölüm Seviyesindeki Yerinde Türetimler */}
              {sectionLayers.map((layer) => renderPrintableLayer(layer))}
            </div>
          );
        })}
      </div>

      {/* 5. Genel Kapsamda Açılmış Ek Türetimler (varsa) */}
      {(() => {
        const rootLayers = [
          ...(layersByTargetId['root'] || []),
          ...(layersByTargetId['general'] || [])
        ].filter((l) => !renderedLayerIds.has(l.id));

        if (rootLayers.length === 0) return null;

        return (
          <div className="mt-6 pt-3 border-t border-stone-300">
            <div className="text-xs font-sans font-bold uppercase tracking-wide text-black mb-2">
              {translate("Genel Konu İncelemeleri:")}</div>
            {rootLayers.map((layer) => renderPrintableLayer(layer))}
          </div>
        );
      })()}
    </div>
  );
};

/**
 * PrintableReport:
 * Tarayıcı üzerinden A4 PDF veya kağıt baskısı alındığında (@media print)
 * çalışan, tekil veya çoklu (merged) problem dokümanlarını içeren akademik rapor şablonu.
 * Ekran görünümünde gizlidir (hidden print:block).
 */
export const PrintableReport: React.FC<PrintableReportProps> = ({
  document,
  layers,
  maxDepth = 0,
  documents
}) => {
  const items: PrintableDocumentItem[] = useMemo(() => {
    if (documents && documents.length > 0) {
      return documents;
    }
    if (document) {
      return [{ document, layers: layers || [], maxDepth }];
    }
    return [];
  }, [documents, document, layers, maxDepth]);

  if (items.length === 0) return null;

  return (
    <div
      id="katmandu-print-root"
      className="hidden print:block bg-white text-black p-0 font-serif leading-relaxed select-text"
    >
      {items.map((item, idx) => (
        <div
          key={item.document.id || idx}
          className={idx > 0 ? 'break-before-page pt-6' : ''}
          style={idx > 0 ? { pageBreakBefore: 'always', breakBefore: 'page' } : undefined}
        >
          <SinglePrintableProblem
            item={item}
            index={items.length > 1 ? idx + 1 : undefined}
            total={items.length > 1 ? items.length : undefined}
          />
        </div>
      ))}
    </div>
  );
};
