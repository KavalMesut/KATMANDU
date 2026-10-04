import { useLanguage } from '../i18n/react';
import { translate } from '../i18n';
import React, { useState, useMemo } from 'react';
import {
  SolutionDocument,
  DerivationTreeNode,
  ExpansionLayer,
  ProblemTab
} from '../domain/types';
import {
  exportToLaTeX,
  exportMultipleToLaTeX,
  getLayersForExport,
  getMaxTreeDepth
} from '../domain/latexExporter';
import { downloadFile, triggerBrowserPrint } from '../domain/pdfExporter';
import { PrintableDocumentItem } from './PrintableReport';
import {
  X,
  FileText,
  FileCode,
  Printer,
  Copy,
  Check,
  Download,
  Upload,
  Layers,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  Info,
  Files,
  CheckSquare,
  Square
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: SolutionDocument | null;
  tree: DerivationTreeNode;
  expansionCache: Record<string, ExpansionLayer>;
  onPreparePrint: (layers: ExpansionLayer[], depth: number) => void;
  tabs?: ProblemTab[];
  activeTabId?: string;
  onPrepareMultiPrint?: (items: PrintableDocumentItem[]) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  document,
  tree,
  expansionCache,
  onPreparePrint,
  tabs,
  activeTabId,
  onPrepareMultiPrint
}) => {
  const [activeTab, setActiveTab] = useState<'pdf' | 'latex'>('pdf');
  const [selectedDepth, setSelectedDepth] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);

  // Çözülmüş dokümanı olan tüm sekmeler
  const availableTabs = useMemo(() => {
    if (!tabs || tabs.length === 0) return [];
    return tabs.filter((t) => t.document !== null);
  }, [tabs]);

  const [exportScope, setExportScope] = useState<'single' | 'merge'>('single');
  const [selectedTabIds, setSelectedTabIds] = useState<string[]>(() => {
    return (tabs && tabs.length > 0) ? tabs.filter((t) => t.document !== null).map((t) => t.id) : [];
  });

  // Ağaçtaki maksimum derinlik
  const maxAvailableDepth = useMemo(() => {
    try {
      if (exportScope === 'merge' && availableTabs.length > 0) {
        let maxD = 0;
        for (const t of availableTabs) {
          if (selectedTabIds.includes(t.id)) {
            const d = getMaxTreeDepth(t.tree);
            if (d > maxD) maxD = d;
          }
        }
        return maxD;
      }
      return getMaxTreeDepth(tree);
    } catch {
      return 0;
    }
  }, [tree, exportScope, availableTabs, selectedTabIds]);

  // Seçilen derinliğe göre filtrelenmiş katmanlar (Tekil soru için)
  const filteredLayers = useMemo(() => {
    try {
      return getLayersForExport(tree, selectedDepth, expansionCache);
    } catch (err) {
      console.warn(translate("Katman filtreleme hatası:"), err);
      return [];
    }
  }, [tree, selectedDepth, expansionCache]);

  // Sayım istatistikleri
  const stats = useMemo(() => {
    if (exportScope === 'merge' && availableTabs.length > 0) {
      const selectedTabs = availableTabs.filter((t) => selectedTabIds.includes(t.id));
      let totalSections = 0;
      let totalEquations = 0;
      let totalLayers = 0;
      let totalAxioms = 0;

      for (const t of selectedTabs) {
        if (!t.document) continue;
        totalSections += t.document.sections?.length || 0;
        totalEquations += t.document.totalEquations || 0;
        const layers = getLayersForExport(t.tree, selectedDepth, t.expansionCache) || [];
        totalLayers += layers.length;
        totalAxioms += layers.filter((l) => Boolean(l && l.isAxiomatic)).length;
      }

      return {
        problems: selectedTabs.length,
        sections: totalSections,
        equations: totalEquations,
        layers: totalLayers,
        axioms: totalAxioms
      };
    }

    if (!document) return { problems: 0, sections: 0, equations: 0, layers: 0, axioms: 0 };
    const safeLayers = filteredLayers || [];
    const axioms = safeLayers.filter((l) => Boolean(l && l.isAxiomatic)).length;
    return {
      problems: 1,
      sections: document.sections?.length || 0,
      equations: document.totalEquations || 0,
      layers: safeLayers.length,
      axioms
    };
  }, [document, filteredLayers, exportScope, availableTabs, selectedTabIds, selectedDepth]);

  // LaTeX çıktısı
  const language = useLanguage();
  const latexSource = useMemo(() => {
    if (!document && availableTabs.length === 0) return '';
    try {
      if (exportScope === 'merge' && availableTabs.length > 0) {
        const selectedTabs = availableTabs.filter((t) => selectedTabIds.includes(t.id));
        if (selectedTabs.length === 0) {
          return translate("% Lütfen birleştirmek için en az bir soru seçiniz.\n");
        }
        const items = selectedTabs.map((t) => ({
          document: t.document!,
          layers: getLayersForExport(t.tree, selectedDepth, t.expansionCache)
        }));
        return exportMultipleToLaTeX(items, {
          maxDepth: selectedDepth,
          includeDiagrams: true,
          includeAppendix: true
        });
      }

      if (!document) return '';
      return exportToLaTeX(document, filteredLayers, {
        maxDepth: selectedDepth,
        includeDiagrams: true,
        includeAppendix: true
      });
    } catch (err) {
      console.error(translate("LaTeX dışa aktarma derleme hatası:"), err);
      return translate("% LaTeX kodu oluşturulurken bir hata oluştu: {0}\n", [err instanceof Error ? err.message : String(err)]);
    }
  }, [document, filteredLayers, selectedDepth, exportScope, availableTabs, selectedTabIds, language]);

  if (!isOpen || (!document && availableTabs.length === 0)) return null;

  const toggleTabSelection = (tabId: string) => {
    setSelectedTabIds((prev) =>
      prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId]
    );
  };

  const handleSelectAllTabs = () => {
    setSelectedTabIds(availableTabs.map((t) => t.id));
  };

  const handleClearTabSelection = () => {
    setSelectedTabIds([]);
  };

  const handleCopyLaTeX = async () => {
    try {
      await navigator.clipboard.writeText(latexSource);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error(translate("Panoya kopyalama hatası:"), err);
    }
  };

  const handleDownloadLaTeX = () => {
    const filename =
      exportScope === 'merge'
        ? translate("katmandu_birlestirilmis_{0}_soru.tex", [selectedTabIds.length])
        : `katmandu_${document?.id || translate("cozum")}.tex`;
    downloadFile(latexSource, filename, 'application/x-tex;charset=utf-8');
  };

  const handlePrintPDF = () => {
    if (exportScope === 'merge' && onPrepareMultiPrint && availableTabs.length > 0) {
      const selectedTabs = availableTabs.filter((t) => selectedTabIds.includes(t.id));
      if (selectedTabs.length > 0) {
        const items: PrintableDocumentItem[] = selectedTabs.map((t) => ({
          document: t.document!,
          layers: getLayersForExport(t.tree, selectedDepth, t.expansionCache),
          maxDepth: selectedDepth
        }));
        onPrepareMultiPrint(items);
        onClose();
        setTimeout(() => {
          triggerBrowserPrint();
        }, 250);
        return;
      }
    }

    // Tekil soru yazdırma
    onPreparePrint(filteredLayers, selectedDepth);
    onClose();
    setTimeout(() => {
      triggerBrowserPrint();
    }, 200);
  };

  return (
    <div className="workspace-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in no-print">
      <div className="workspace-modal-card export-modal-card bg-white dark:bg-panel border border-stone-300 dark:border-stone-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100">
        {/* Modal Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-900 dark:text-amber-400 shadow-2xs">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-stone-900 dark:text-stone-100">
                {translate("Çözümü Dışa Aktar (Export)")}</h2>
              <p className="text-xs font-sans text-stone-500 dark:text-stone-400">
                {translate("İster tek tek soruları seçin, ister tüm soruları birleştirerek (merge) PDF veya LaTeX çıktısı alın")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={translate("Kapat")}
            className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Kapsam Seçimi (Tekil Soru vs Çoklu Soru Birleştir) */}
        {availableTabs.length > 1 && (
          <div className="px-6 pt-3 pb-1 bg-stone-50/70 dark:bg-panel border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-sans font-semibold text-stone-700 dark:text-stone-300">
                {translate("Kapsam:")}</span>
              <div className="inline-flex rounded-md border border-stone-300 dark:border-stone-700 p-0.5 bg-white dark:bg-stone-800">
                <button
                  type="button"
                  onClick={() => setExportScope('single')}
                  className={`px-3 py-1 text-xs font-sans rounded transition-colors ${
                    exportScope === 'single'
                      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-950 dark:text-amber-200 font-semibold shadow-2xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {translate("Yalnızca Aktif Soru")}</button>
                <button
                  type="button"
                  onClick={() => setExportScope('merge')}
                  className={`px-3 py-1 text-xs font-sans rounded transition-colors flex items-center gap-1.5 ${
                    exportScope === 'merge'
                      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-950 dark:text-amber-200 font-semibold shadow-2xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  <Files className="w-3.5 h-3.5" />
                  <span>{translate("Soruları Birleştir (Merge •")} {selectedTabIds.length}/{availableTabs.length})</span>
                </button>
              </div>
            </div>

            {exportScope === 'merge' && (
              <div className="flex items-center gap-2 text-[11px] font-sans">
                <button
                  type="button"
                  onClick={handleSelectAllTabs}
                  className="text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  {translate("Tümünü Seç")}</button>
                <span className="text-stone-300 dark:text-stone-600">|</span>
                <button
                  type="button"
                  onClick={handleClearTabSelection}
                  className="text-stone-500 hover:underline cursor-pointer"
                >
                  {translate("Temizle")}</button>
              </div>
            )}
          </div>
        )}

        {/* Çoklu Soru Seçim Kutuları (Sadece Merge Modunda Görünür) */}
        {exportScope === 'merge' && availableTabs.length > 1 && (
          <div className="px-6 py-2.5 bg-amber-50/40 dark:bg-amber-950/10 border-b border-stone-200 dark:border-stone-800 max-h-36 overflow-y-auto">
            <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 block mb-1.5">
              {translate("Dahil Edilecek Sorular:")}</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableTabs.map((tab, idx) => {
                const isSelected = selectedTabIds.includes(tab.id);
                return (
                  <div
                    key={tab.id}
                    onClick={() => toggleTabSelection(tab.id)}
                    className={`flex items-center gap-2 p-2 rounded border text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-white dark:bg-[#252420] border-amber-400 dark:border-amber-700 text-stone-900 dark:text-stone-100 shadow-2xs'
                        : 'bg-stone-50/80 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 text-stone-500 opacity-70'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-stone-400 shrink-0" />
                    )}
                    <span className="font-mono font-bold text-stone-600 dark:text-stone-400 shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="truncate font-serif font-medium">
                      {tab.document?.problemTitle || tab.problem.text.slice(0, 30)}
                    </span>
                    {activeTabId === tab.id && (
                      <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 shrink-0 ml-auto font-medium">
                        {translate("Aktif")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Format Seçim Sekmeleri (PDF vs LaTeX) */}
        <div className="flex border-b border-stone-200 dark:border-stone-800 px-6 pt-3 bg-stone-100/60 dark:bg-[#23221e]">
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-sans font-medium transition-colors border-b-2 ${
              activeTab === 'pdf'
                ? 'border-amber-600 text-amber-900 dark:text-amber-400'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{translate("PDF (Akademik A4 Baskı)")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('latex')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-sans font-medium transition-colors border-b-2 ${
              activeTab === 'latex'
                ? 'border-amber-600 text-amber-900 dark:text-amber-400'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>{translate("LaTeX (.tex Kaynak Kodu)")}</span>
          </button>
        </div>

        {/* Modal İçerik Gövdesi */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Katman Derinliği (Scope) Seçim Paneli */}
          <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#252420] border border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-sans font-semibold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                <Layers className="w-4 h-4 text-amber-700 dark:text-amber-500" />
                <span>{translate("Katman Derinliği ve Kapsam Seçimi")}</span>
              </div>
              <span className="text-[11px] font-sans text-stone-500 dark:text-stone-400">
                {translate("Mevcut Maksimum Derinlik:")}{maxAvailableDepth}
              </span>
            </div>

            {/* Hızlı Seçim Butonları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setSelectedDepth(0)}
                className={`p-2.5 rounded-md border text-left transition-all ${
                  selectedDepth === 0
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 font-medium shadow-2xs'
                    : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="text-xs font-sans font-semibold">{translate("Derinlik 0")}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {translate("Yalnızca Ana Çözüm")}</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDepth(1)}
                disabled={maxAvailableDepth < 1}
                className={`p-2.5 rounded-md border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  selectedDepth === 1
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 font-medium shadow-2xs'
                    : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="text-xs font-sans font-semibold">{translate("Derinlik 1")}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {translate("1. Katman İspatları")}</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDepth(2)}
                disabled={maxAvailableDepth < 2}
                className={`p-2.5 rounded-md border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  selectedDepth === 2
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 font-medium shadow-2xs'
                    : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="text-xs font-sans font-semibold">{translate("Derinlik 2")}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {translate("Alt Ara Türetimler")}</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDepth(Math.max(1, maxAvailableDepth))}
                disabled={maxAvailableDepth < 1}
                className={`p-2.5 rounded-md border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  selectedDepth >= maxAvailableDepth && maxAvailableDepth > 0
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 font-medium shadow-2xs'
                    : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="text-xs font-sans font-semibold">{translate("Tüm Ağaç")}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {translate("Aksiyomlara Kadar")}</div>
              </button>
            </div>

            {/* İnce Ayar Kaydırıcı (Slider) */}
            {maxAvailableDepth > 1 && (
              <div className="flex items-center gap-4 pt-2 border-t border-stone-200 dark:border-stone-800">
                <div className="flex items-center gap-1.5 text-xs font-sans text-stone-600 dark:text-stone-400 shrink-0">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{translate("Özel Derinlik:")}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxAvailableDepth}
                  value={selectedDepth}
                  onChange={(e) => setSelectedDepth(Number(e.target.value))}
                  className="flex-1 accent-amber-700 dark:accent-amber-500 cursor-pointer"
                />
                <span className="text-xs font-mono font-bold w-6 text-center text-stone-800 dark:text-stone-200">
                  {selectedDepth}
                </span>
              </div>
            )}

            {/* Dahil Edilecek Öğe İstatistikleri */}
            <div className="flex flex-wrap items-center gap-3 pt-3 mt-3 border-t border-stone-200 dark:border-stone-800 text-[11px] font-sans text-stone-600 dark:text-stone-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <b>{stats.sections}</b> {translate("Bölüm")}</span>
              <span>•</span>
              <span>
                <b>{stats.equations}</b> {translate("Ana Denklem")}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <b>{stats.layers}</b> {translate("Türetim Katmanı")}</span>
              {stats.axioms > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <ShieldCheck className="w-3 h-3" />
                    <b>{stats.axioms}</b> {translate("Aksiyomatik Doğa Yasası")}</span>
                </>
              )}
            </div>
          </div>

          {/* Sekme 1: PDF Açıklaması ve Önizleme Bilgisi */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 text-xs font-serif leading-relaxed text-stone-800 dark:text-stone-200">
                <div className="flex items-center gap-2 mb-2 font-sans font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  <Info className="w-4 h-4" />
                  <span>{translate("Akademik A4 Mizanpaj Standartları")}</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside font-sans text-[12px] text-stone-700 dark:text-stone-300">
                  <li>
                    <b>{translate("Sayfa Boyutu & Kenar Boşlukları:")}</b> {translate("Standart A4 Dikey (210mm × 297mm), 20mm kenar payları.")}</li>
                  <li>
                    <b>{translate("Tipografi:")}</b> {translate("12 punto akademik serif metin, kusursuz KaTeX matematik sembolleri.")}</li>
                  <li>
                    <b>{translate("Bölünmeyi Önleme (Page Break):")}</b> {translate("Denklemler ve vektörel SVG şemaları sayfa bölünmelerinde parçalanmaz.")}</li>
                  <li>
                    <b>{translate("Ek Bölüm (Appendix):")}</b>  {translate("Seçilen derinlikteki (")}{stats.layers} {translate("adet) türetim katmanı \"Ek A\" başlığı altında otomatik numaralandırılarak eklenir.")}</li>
                </ul>
              </div>

              <div className="p-4 border border-stone-200 dark:border-stone-800 rounded-lg text-center bg-stone-50/50 dark:bg-[#252420]">
                <Printer className="w-8 h-8 mx-auto mb-2 text-stone-500 dark:text-stone-400" />
                <h4 className="text-sm font-serif font-bold text-stone-900 dark:text-stone-100">
                  {translate("Yazdırma ve PDF Olarak Kaydetme")}</h4>
                <p className="text-xs font-sans text-stone-500 dark:text-stone-400 max-w-md mx-auto mt-1 mb-4">
                  {translate("\"PDF Olarak Yazdır / Kaydet\" butonuna tıkladığınızda açılan pencerede hedefi \"PDF Olarak Kaydet\" seçerek vektörel A4 PDF oluşturabilirsiniz.")}</p>
                <button
                  type="button"
                  onClick={handlePrintPDF}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-sans font-semibold rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>{translate("PDF Olarak Yazdır / Kaydet")}</span>
                </button>
              </div>
            </div>
          )}

          {/* Sekme 2: LaTeX (.tex) Önizleme ve İndirme */}
          {activeTab === 'latex' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-sans text-stone-500 dark:text-stone-400">
                  {translate("Bağımsız derlenebilir LaTeX kaynak kodu (amsmath, tikz, hyperref, tcolorbox):")}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLaTeX}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          {translate("Kopyalandı!")}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{translate("Panoya Kopyala")}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadLaTeX}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded bg-amber-700 hover:bg-amber-800 text-white transition-colors shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{translate(".tex İndir")}</span>
                  </button>
                </div>
              </div>

              {/* Monospace Kod Kutusu */}
              <div className="relative">
                <pre className="p-4 rounded-lg bg-stone-900 text-stone-200 font-mono text-[11px] leading-relaxed max-h-72 overflow-y-auto select-all border border-stone-800">
                  {latexSource}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Alt Çubuk */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-[#252420]">
          <span className="text-xs font-sans text-stone-500 dark:text-stone-400">
            {translate("KATMANDU v2 • Akademik Dışa Aktarma")}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-sans font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 rounded transition-colors"
          >
            {translate("Kapat")}</button>
        </div>
      </div>
    </div>
  );
};
