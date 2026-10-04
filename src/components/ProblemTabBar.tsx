import { translate, localizeTabTitle } from '../i18n';
import React from 'react';
import { ProblemTab } from '../domain/types';
import { Plus, X, RefreshCw, FileText, Layers, AlertCircle } from 'lucide-react';

export interface ProblemTabBarProps {
  tabs: ProblemTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

/**
 * ProblemTabBar:
 * Orta panelin üstünde yer alan, üniversite ders kitabı ve akademik çalışma ortamı
 * sadeliğinde çoklu soru sekmeleri yöneticisi.
 */
export const ProblemTabBar: React.FC<ProblemTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab
}) => {
  return (
    <div className="flex items-center border-b border-[#e5ded0] dark:border-stone-800 bg-[#ede5d4]/70 dark:bg-canvas px-3 pt-2 gap-1 overflow-x-auto select-none shrink-0 scrollbar-none z-10">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        const problemSummary =
          tab.document?.problemTitle ||
          (tab.problem.text
            ? tab.problem.text.replace(/\s+/g, ' ').trim().slice(0, 28) + (tab.problem.text.length > 28 ? '...' : '')
            : translate("Yeni Çalışma"));

        const layerCount = tab.openLayerIds.length;

        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            title={`${localizeTabTitle(tab.tabTitle)}: ${tab.document?.problemTitle || tab.problem.text}`}
            className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-sans transition-all cursor-pointer border-t border-x shrink-0 max-w-[240px] sm:max-w-[280px] ${
              isActive
                ? 'spectrum-tab-active bg-[#faf6ee] dark:bg-selected text-stone-900 dark:text-stone-100 font-semibold border-[#dcceb8] dark:border-stone-800 border-b-transparent shadow-2xs -mb-[1px] z-10'
                : 'bg-[#e4dbca]/60 dark:bg-canvas/60 text-stone-600 dark:text-stone-400 hover:bg-[#eae2d2] dark:hover:bg-stone-800/80 hover:text-stone-800 dark:hover:text-stone-200 border-transparent'
            }`}
          >
            {/* Yükleniyor Spinner veya Belge İkonu */}
            {tab.isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700 dark:text-amber-500 shrink-0" />
            ) : tab.errorMessage ? (
              <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
            ) : (
              <FileText
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActive
                    ? 'text-amber-800 dark:text-amber-500'
                    : 'text-stone-400 dark:text-stone-500'
                }`}
              />
            )}

            {/* Çalışma / Problem Başlığı */}
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="font-mono text-[11px] font-bold text-amber-900 dark:text-amber-300 shrink-0">
                {localizeTabTitle(tab.tabTitle) || translate("Çalışma {0}", [index + 1])}
              </span>
              <span className="truncate text-stone-700 dark:text-stone-300 font-normal">
                {problemSummary}
              </span>
            </div>

            {/* Açık Yerinde Türetim Rozeti */}
            {layerCount > 0 && (
              <span
                className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800 shrink-0"
                title={translate("{0} Yerinde Türetim Katmanı Açık", [layerCount])}
              >
                <Layers className="w-2.5 h-2.5" />
                {layerCount}
              </span>
            )}

            {/* Kapat Butonu (En az 1 sekme kalması gerektiğinden tabs.length > 1 ise görünür) */}
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:bg-stone-300/60 dark:hover:bg-stone-700 p-0.5 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-opacity ml-0.5 cursor-pointer"
                title={translate("Sekmeyi Kapat")}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* Yeni Sekme Ekle Butonu */}
      <button
        type="button"
        onClick={onNewTab}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-t-md text-xs font-sans font-medium text-stone-600 dark:text-stone-400 hover:bg-[#e4dbca] dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-200 transition-colors shrink-0 mb-0.5 cursor-pointer"
        title={translate("Yeni Soru Ekle (Yeni Sekme)")}
      >
        <Plus className="w-3.5 h-3.5 text-amber-800 dark:text-amber-500" />
        <span className="hidden md:inline text-[11px]">{translate("Yeni Soru")}</span>
      </button>
    </div>
  );
};
