import { getLocale } from '../i18n';
import { translate } from '../i18n';
import type { SolutionExecutionReport, TokenUsage } from '../domain/usageReport';

function tokens(value: number | null): string {
  return value === null ? translate("Bilinmiyor") : new Intl.NumberFormat(getLocale()).format(value);
}

function level(value: string): string {
  return ({ low: translate("düşük"), medium: translate("orta"), high: translate("yüksek"), xhigh: translate("çok yüksek"), max: translate("en yüksek") } as Record<string, string>)[value] || value;
}

function dollars(value: number): string {
  if (value > 0 && value < 0.000001) return '<$0.000001';
  return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

function costText(run: SolutionExecutionReport['runs'][number]): string {
  if (!run.cost) return translate("Ücret bilgisi yok");
  const label = run.cost.source === 'catalog' ? translate("tahmini") : run.cost.source === 'provider' ? translate("sağlayıcı bildirimi") : translate("çevrimdışı");
  return `${dollars(run.cost.usd)} (${label})`;
}

function usageText(usage: TokenUsage): string {
  if (!usage.reportedCalls && !usage.unreportedCalls && usage.totalTokens === 0) return translate("0 token (çevrimdışı)");
  if (!usage.reportedCalls) return translate("Token bilgisi dönmedi");
  const suffix = usage.unreportedCalls ? translate(" (eksik API verisi)") : '';
  const other = usage.totalTokens !== null && usage.inputTokens !== null && usage.outputTokens !== null
    ? usage.totalTokens - usage.inputTokens - usage.outputTokens : 0;
  return translate("{0} token · girdi {1} / çıktı {2}{3}{4}", [tokens(usage.totalTokens), tokens(usage.inputTokens), tokens(usage.outputTokens), other > 0 ? translate(" / düşünme-diğer {0}", [tokens(other)]) : '', suffix]);
}

export function ExecutionReportPanel({ report }: { report: SolutionExecutionReport }) {
  const pricedRuns = report.runs.filter(run => run.cost);
  const knownCost = pricedRuns.reduce((sum, run) => sum + (run.cost?.usd || 0), 0);
  const completeCost = pricedRuns.length === report.runs.length;
  const estimated = pricedRuns.some(run => run.cost?.source === 'catalog');
  return (
    <section aria-label={translate("Çözüm kullanım raporu")} className="shrink-0 border-t border-[#e4dcce] dark:border-stone-800 bg-[#f3ede0] dark:bg-panel p-3 text-[11px] text-stone-700 dark:text-stone-300 font-sans">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-semibold uppercase tracking-wide text-[10px]">{translate("Çözüm raporu")}</h3>
        <span className="font-mono font-semibold">{(report.durationMs / 1000).toFixed(1)}  {translate("sn")}</span>
      </div>
      <div className="max-h-36 overflow-y-auto space-y-1.5">
        {report.runs.map((run, index) => (
          <div key={`${run.role}-${index}`} className="rounded border border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-stone-900/50 px-2 py-1.5">
            <div className="font-medium break-all">
              {run.role === 'router' ? translate("Öneri") : run.role === 'detection' ? translate("Soru ayırma") : translate("Çözüm")}: {run.modelName}
              {` · ${run.reasoningEffort ? level(run.reasoningEffort) : translate("seviye belirtilmedi")}`}
            </div>
            <div className="text-stone-500 dark:text-stone-400">{run.providerName} · {usageText(run.usage)}</div>
            <div className="text-stone-500 dark:text-stone-400">{translate("Ücret:")} {costText(run)}</div>
            {run.sharedAcrossQuestions && <div className="text-amber-800 dark:text-amber-400">{run.sharedAcrossQuestions}  {translate("soru arasında paylaşılan çağrı")}</div>}
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-700 font-medium">
        {translate("Toplam:")}{usageText(report.totalUsage)}
        <div>{translate("Toplam ücret:")} {completeCost
          ? `${dollars(knownCost)}${estimated ? translate(" (en az bir tahmin içerir)") : ''}`
          : pricedRuns.length ? translate("bilinmiyor · bilinen kısım {0}", [dollars(knownCost)]) : translate("bilinmiyor")}</div>
      </div>
      {report.runs.some(run => run.sharedAcrossQuestions) && <p className="mt-1 text-stone-500 dark:text-stone-400">{translate("Paylaşılan çağrı her ilgili soruda gösterilir; soruların toplamlarını toplamayın.")}</p>}
    </section>
  );
}
