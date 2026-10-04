import { translate } from '../i18n';
import { getVerificationNotice } from '../domain/verification';
import React, { useRef, useState, useMemo } from 'react';
import {
  SolutionDocument,
  ExpansionLayer,
  EquationBlock,
  RecommendedPath
} from '../domain/types';
import { SectionView } from './SectionView';
import { InlineExpansionView } from './InlineExpansionView';
import { SimpleDiagram } from './SimpleDiagram';
import { KaTeXRenderer, getSymbolMeaning, MathExplanationContext } from './KaTeXRenderer';
import { TextSelectionToolbar, InquireContext } from './TextSelectionToolbar';
import {
  BookOpen,
  FileText,
  MessageSquare,
  Send,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

interface PaperLayoutProps {
  document: SolutionDocument;
  selectedEquation: EquationBlock | null;
  isExpanding?: boolean;
  expandingBlockId?: string | null;
  layersByTargetId?: Record<string, ExpansionLayer[]>;
  openLayerIds?: Set<string>;
  onToggleLayer?: (layerId: string) => void;
  zoom?: number;
  onSelectEquation: (equation: EquationBlock) => void;
  onContextualInquire: (selectedText: string, customQuery?: string, context?: InquireContext) => void;
  onSolveAlternativePath?: (path: RecommendedPath) => void;
  isSolvingPath?: boolean;
}

/**
 * PaperLayout:
 * Klasik bir akademik makale veya A4 PDF sayfası sadeliğinde (HD-001, HD-002)
 * bilimsel çözümü ve yerinde (inline) açılan derinleşme akordeonlarını render eder.
 * Sayfa değiştirme yapmaz; tüm türetimler ait oldukları denklemlerin arasına yerleşir.
 * 12pt (~16px) font boyutu ve A4 (210mm) genişlik oranlarıyla sürekli aşağı kayar.
 * Açık ve koyu modu (dark mode) tam destekler.
 */
export const PaperLayout: React.FC<PaperLayoutProps> = ({
  document,
  selectedEquation,
  isExpanding = false,
  expandingBlockId = null,
  layersByTargetId = {},
  openLayerIds = new Set(),
  onToggleLayer,
  zoom = 1,
  onSelectEquation,
  onContextualInquire,
  onSolveAlternativePath,
  isSolvingPath = false
}) => {
  const paperRef = useRef<HTMLElement>(null);
  const [generalQuery, setGeneralQuery] = useState('');

  // Tüm çözüm metnini ve açılmış katmanları bağlam olarak derle
  const solutionContext = useMemo(() => {
    const allLayers = Object.values(layersByTargetId).flat();
    return [
      document.problemTitle,
      document.problemText,
      document.strategy,
      ...(document.assumptions || []),
      ...document.sections.flatMap((s) => [
        s.title,
        ...s.blocks.map((b) => (b.kind === 'prose' ? b.text : b.kind === 'equation' ? b.latex : ''))
      ]),
      ...allLayers.flatMap((l) => [
        l.title,
        l.contextualQuery || '',
        ...l.blocks.map((b) => (b.kind === 'prose' ? b.text : b.kind === 'equation' ? b.latex : ''))
      ])
    ].filter(Boolean).join(' ');
  }, [document, layersByTargetId]);

  const handleFormulaClick = (formula: string, isSingleSymbol: boolean) => {
    const meaning = getSymbolMeaning(formula, solutionContext);
    const question = isSingleSymbol
      ? (meaning
          ? translate("{0} sembolü ({1}) bu problemde neyi temsil eder, boyutu/birimi ve fiziksel anlamı nedir?", [formula, meaning])
          : translate("{0} sembolü bu problemde neyi temsil eder, birimi ve fiziksel/matematiksel anlamı nedir?", [formula]))
      : translate("Bu matematiksel ifadenin ({0}) anlamı, gerekçesi ve türetimi nedir?", [formula]);
    onContextualInquire(formula, question);
  };

  const handleGeneralSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!generalQuery.trim() || isExpanding) return;
    onContextualInquire(translate("Genel Problem ve Çözüm Çerçevesi"), generalQuery.trim());
    setGeneralQuery('');
  };

  // Genel bağlamda açılmış katmanlar (root veya general)
  const generalLayers = [
    ...(layersByTargetId['general'] || []),
    ...(layersByTargetId['root'] || [])
  ];

  return (
    <MathExplanationContext.Provider value={solutionContext}>
      <article
        ref={paperRef}
        style={{
          zoom
        }}
        className="spectrum-paper w-full max-w-[210mm] min-h-[297mm] mx-auto my-8 bg-[#fdfcf7] dark:bg-paper border border-[#e6decb] dark:border-stone-800 shadow-[0_4px_24px_-4px_rgba(90,70,40,0.07),0_2px_8px_-2px_rgba(0,0,0,0.04)] rounded-xs px-10 sm:px-16 py-14 transition-colors duration-200 select-text text-[#231f1c] dark:text-stone-100 font-serif text-[16px] leading-[1.65] a4-paper"
      >
        <p className="mb-6 text-sm font-sans text-stone-600 dark:text-stone-400" role="note">
          {getVerificationNotice(document)}
        </p>
        {/* Üst Belge Başlığı */}
        <header className="border-b border-[#e6decb] dark:border-stone-800 pb-6 mb-8 text-center">
          <div className="inline-flex items-center gap-1.5 text-stone-600 dark:text-stone-400 text-xs uppercase tracking-widest font-sans font-medium mb-2">
            <BookOpen className="w-3.5 h-3.5 text-amber-800 dark:text-amber-500" />
            <span>{translate("KATMANDU Bilimsel Çözüm Raporu")}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1c1917] dark:text-stone-100 tracking-tight leading-snug">
            {document.problemTitle}
          </h1>
        </header>

        {/* Problem Metni */}
        <section className="mb-8 p-6 rounded bg-[#f9f6ee] dark:bg-panel border border-[#e6decb] dark:border-stone-800 text-[#231f1c] dark:text-stone-200 font-serif text-base leading-relaxed shadow-2xs">
          <div className="flex items-center justify-between mb-3 border-b border-[#e6decb]/80 dark:border-stone-800 pb-2">
            <span className="font-semibold not-italic font-sans text-xs uppercase tracking-wider text-[#78350f] dark:text-amber-400">
              PROBLEM
            </span>
            {document.attachments && document.attachments.length > 0 && (
              <span className="text-[11px] font-sans not-italic text-stone-500 dark:text-stone-400">
                {translate("Kaynak:")}{document.attachments.map((a) => a.name).join(', ')}
              </span>
            )}
          </div>

          {/* Transkribe Edilmiş Tam Soru Metni */}
          <div className="italic text-[#1c1917] dark:text-stone-100 mb-4">
            <KaTeXRenderer
              content={document.problemText || translate("Problem görsel/doküman üzerinden çözümlenmiştir.")}
              onFormulaClick={handleFormulaClick}
            />
          </div>

          {/* Sorunun Vektörel Kurulum Şeması (problemDiagram) */}
          {document.problemDiagram && (
            <div className="my-6 not-italic">
              <div className="max-w-md mx-auto">
                <SimpleDiagram spec={document.problemDiagram} />
              </div>
            </div>
          )}

          {/* Yüklenen Orijinal Soru Görseli */}
          {document.attachments &&
            document.attachments.some((a) => a.type === 'image' && a.dataUrl) && (
              <div className="mt-5 pt-4 border-t border-stone-200/80 dark:border-stone-800 not-italic">
                <span className="text-[11px] font-sans uppercase font-semibold text-stone-500 dark:text-stone-400 block mb-2">
                  {translate("Yüklenen Orijinal Soru Görseli:")}</span>
                <div className="flex flex-wrap gap-4 justify-center">
                  {document.attachments
                    .filter((a) => a.type === 'image' && a.dataUrl)
                    .map((att) => (
                      <div
                        key={att.id}
                        className="p-2 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-700 shadow-xs max-w-sm"
                      >
                        <img
                          src={att.dataUrl}
                          alt={att.name}
                          className="max-h-64 w-auto mx-auto object-contain rounded"
                        />
                        <div className="text-center text-[11px] font-sans text-stone-500 dark:text-stone-400 mt-1.5 italic">
                          {att.name}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

          {/* Ekli PDF Dokümanları */}
          {document.attachments &&
            document.attachments.some((a) => a.type === 'pdf') && (
              <div className="mt-4 pt-3 border-t border-stone-200/80 dark:border-stone-800 flex flex-wrap gap-2 not-italic">
                {document.attachments
                  .filter((a) => a.type === 'pdf')
                  .map((att) => (
                    <div
                      key={att.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xs text-xs font-sans"
                    >
                      <FileText className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400 shrink-0" />
                      <span className="font-medium text-stone-800 dark:text-stone-200">{att.name}</span>
                      <span className="text-[10px] text-stone-400 dark:text-stone-500">{translate("PDF Dokümanı")}</span>
                    </div>
                  ))}
              </div>
            )}
        </section>

        {/* Çözüm Stratejisi & Varsayımlar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 pb-6 border-b border-[#e6decb] dark:border-stone-800">
          <div className="md:col-span-2">
            <h3 className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              {translate("Çözüm Stratejisi")}</h3>
            <p className="text-[#292524] dark:text-stone-200 font-serif text-[15px] leading-relaxed">
              <KaTeXRenderer content={document.strategy} onFormulaClick={handleFormulaClick} />
            </p>
          </div>

          {document.assumptions.length > 0 && (
            <div className="border-l border-[#e6decb] dark:border-stone-800 pl-4">
              <h3 className="text-xs font-sans font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                {translate("Model Varsayımları")}</h3>
              <ul className="text-stone-700 dark:text-stone-300 font-serif text-xs space-y-1.5 list-disc list-inside">
                {document.assumptions.map((asm, idx) => (
                  <li key={idx} className="leading-snug">
                    <KaTeXRenderer content={asm} onFormulaClick={handleFormulaClick} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Ana Çözüm Bölümleri ve Yerinde (Inline) Türetim Akordeonları */}
        <main>
          {document.sections.map((section, idx) => (
            <SectionView
              key={section.id}
              section={section}
              sectionIndex={idx}
              selectedEquationId={selectedEquation?.id}
              advancedChecks={document.verification?.advancedChecks}
              layersByTargetId={layersByTargetId}
              openLayerIds={openLayerIds}
              expandingBlockId={expandingBlockId}
              onToggleLayer={onToggleLayer}
              onSelectEquation={onSelectEquation}
              onFormulaClick={handleFormulaClick}
              onContextualInquire={onContextualInquire}
            />
          ))}
        </main>

        {/* İsteğe Bağlı Alternatif Çözüm Yolları (2. ve 3. Yol - Zorlama Yok) */}
        {document.recommendedPaths && document.recommendedPaths.length > 0 && (
          <div className="mt-10 pt-6 border-t-2 border-dashed border-indigo-200 dark:border-indigo-900/60 no-print">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
                {translate("Bağımsız Alternatif Çözüm Yolları (İsteğe Bağlı):")}</h3>
            </div>

            <div className="space-y-4">
              {document.recommendedPaths.map((path) => (
                <div
                  key={path.id}
                  className={`p-4 rounded-xl border transition-all duration-150 ${
                    path.solved
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                      : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {path.badge || translate("⚡ 2. Yol")}
                        </span>
                        <h4 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-sm">
                          {path.methodName}
                        </h4>
                      </div>
                      <p className="text-xs text-stone-600 dark:text-stone-300 font-serif leading-relaxed">
                        {path.description}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {path.solved ? (
                        <div className="flex items-center gap-1.5 text-xs font-sans font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{translate("Çözüldü & Belgeye Eklendi")}</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isSolvingPath}
                          onClick={() => onSolveAlternativePath?.(path)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold font-sans rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isSolvingPath ? translate("Çözülüyor...") : translate("✨ 2. Yolu Çöz ve Belgeye Ekle")}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Genel Problem Çerçevesi İçin Açılan Yerinde Türetimler */}
        {generalLayers.length > 0 && (
          <div className="mt-8 space-y-4 border-t border-stone-200 dark:border-stone-800 pt-6">
            <h3 className="text-xs font-sans font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
              {translate("Genel Soru ve Metot İncelemeleri:")}</h3>
            {generalLayers.map((layer) => (
              <InlineExpansionView
                key={layer.id}
                layer={layer}
                isOpen={openLayerIds.has(layer.id)}
                onToggle={() => onToggleLayer?.(layer.id)}
                selectedEquationId={selectedEquation?.id}
                expandingBlockId={expandingBlockId}
                layersByTargetId={layersByTargetId}
                openLayerIds={openLayerIds}
                onToggleLayer={onToggleLayer || (() => {})}
                onSelectEquation={onSelectEquation}
                onFormulaClick={handleFormulaClick}
              />
            ))}
          </div>
        )}

        {/* Çözümün / Konunun En Altı: Sorunun / Konunun Geneli Hakkında Detaylandırma / Derinleşme Sorusu Sor */}
        <section className="mt-14 pt-8 border-t border-stone-200 dark:border-stone-800 no-print">
          <div className="flex items-center gap-2 mb-2 text-stone-700 dark:text-stone-300">
            <MessageSquare className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h3 className="text-sm font-sans font-semibold uppercase tracking-wider">
              {translate("Sorunun / Konunun Geneli Hakkında Detaylandırma Sorusu Sor")}</h3>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 font-sans mb-3">
            {translate("Çözümün veya konunun bütünü, alternatif yaklaşımlar, model varsayımları veya sınır koşulları hakkında serbest soru sorarak yeni bir yerinde inceleme dalı açabilirsiniz.")}</p>
          <form onSubmit={handleGeneralSubmit} className="space-y-3">
            <textarea
              value={generalQuery}
              onChange={(e) => setGeneralQuery(e.target.value)}
              placeholder={translate("Örn: Bu sistemi Lagrange mekaniği yerine enerji korunumu ile nasıl incelerdik? Veya küresel koordinatlardan silindirik koordinatlara dönüşüm nasıl yapılır?")}
              rows={3}
              className="w-full p-3 text-sm font-serif border border-stone-300 dark:border-stone-700 rounded bg-stone-50/60 dark:bg-stone-900/60 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all resize-y"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!generalQuery.trim() || isExpanding}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-sans font-medium rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{translate("Detaylandır & Yerinde Ekle")}</span>
              </button>
            </div>
          </form>
        </section>
      </article>

      {/* Serbest Metin Seçimi Araç Çubuğu */}
      <TextSelectionToolbar
        containerRef={paperRef}
        onInquire={onContextualInquire}
      />
    </MathExplanationContext.Provider>
  );
};
