import { translate } from '../i18n';
import React from 'react';
import { NavigationPathItem } from '../domain/types';
import { ChevronRight, Layers, ArrowLeft, ShieldCheck } from 'lucide-react';

interface NavigationBreadcrumbsProps {
  currentDepth: number;
  path: NavigationPathItem[];
  onNavigateToDepth: (depth: number) => void;
  className?: string;
}

/**
 * NavigationBreadcrumbs (Sağ Gezinme ve Derinlik Paneli):
 * Sınırsız derinliği, aksiyom etiketlerini ve gezinme yolunu gösterir.
 */
export const NavigationBreadcrumbs: React.FC<NavigationBreadcrumbsProps> = ({
  currentDepth,
  path,
  onNavigateToDepth,
  className = ''
}) => {
  return (
    <aside
      aria-label={translate("Gezinme ve Çözüm Derinliği")}
      className={`w-64 shrink-0 bg-stone-50/70 dark:bg-canvas border-l border-stone-200 dark:border-stone-800 p-6 flex flex-col justify-between overflow-y-auto transition-colors ${className}`}
    >
      <div>
        {/* Derinlik Göstergesi */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2 text-stone-700 dark:text-stone-300">
            <Layers className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <span className="text-xs uppercase tracking-wider font-semibold font-sans">
              {translate("Çözüm Düzeyi")}</span>
          </div>
          <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-stone-200/80 dark:bg-stone-800 text-stone-800 dark:text-stone-200">
            {translate("Derinlik")}{currentDepth}
          </span>
        </div>

        {/* Hiyerarşik Çözüm Yolu */}
        <nav className="mt-6">
          <div className="text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400 font-sans font-medium mb-3">
            {translate("Gezinme Yolu")}</div>

          <ol className="space-y-2.5">
            {path.map((item, index) => {
              const isCurrent = index === path.length - 1;
              return (
                <li key={item.layerId} className="flex items-start gap-1.5 text-sm font-serif">
                  <div className="mt-1 text-stone-400 dark:text-stone-500 shrink-0">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isCurrent ? (
                      <div className="font-semibold text-stone-900 dark:text-stone-100 leading-snug break-words">
                        <span>{item.label}</span>
                        {item.targetDisplayNumber !== undefined && (
                          <span className="ml-1 text-xs text-stone-500 dark:text-stone-400 font-sans">
                            ({item.targetDisplayNumber})
                          </span>
                        )}
                        {item.isAxiomatic && (
                          <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-emerald-700 dark:text-emerald-300 font-sans font-medium bg-emerald-50 dark:bg-emerald-950/50 px-1 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            <span>{item.axiomType === 'mathematics' ? 'Matematik Aksiyomu' : translate("Aksiyom")}</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigateToDepth(item.depth)}
                        className="text-left text-stone-600 dark:text-stone-400 hover:text-amber-900 dark:hover:text-amber-300 hover:underline leading-snug transition-colors break-words"
                        title={translate("{0} düzeyine geri dön", [item.label])}
                      >
                        {item.label}
                        {item.targetDisplayNumber !== undefined && (
                          <span className="ml-1 text-xs text-stone-400 dark:text-stone-500 font-sans">
                            ({item.targetDisplayNumber})
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Bilgilendirme Kutusu (İnce & Akademik) */}
        {currentDepth > 0 && (
          <div className="mt-8 p-3 rounded bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-xs text-stone-700 dark:text-stone-300 font-serif leading-relaxed">
            <p className="italic">
              {translate("Her katmanda şekil desteği ve denklemler arası zincirleme türetim aktif durumdadır.")}</p>
          </div>
        )}
      </div>

      {/* Alt: Geri Dönüş Butonu */}
      {currentDepth > 0 && (
        <div className="pt-4 border-t border-stone-200 dark:border-stone-800 mt-6">
          <button
            type="button"
            onClick={() => onNavigateToDepth(currentDepth - 1)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-sans font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800 rounded transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{translate("Bir Üst Düzeye Çık")}</span>
          </button>
        </div>
      )}
    </aside>
  );
};
