import { getLanguage } from '../i18n';
import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { AppConfig } from './config';
import type { ProblemInput, ProblemTab } from './types';
import type { Provider, ProviderSession } from '../providers/providerSession';
import { TabRequestTracker } from './tabRequests';
import { requestTimeout } from './requestControl';
import { TrustedAssembler } from './trustedAssembler';
import { LibraryStorage } from './libraryStorage';
import type { LibrarySummary } from './librarySummary';
import { INITIAL_TREE } from './derivationTree';
import { EMPTY_USAGE, totalRunUsage, withRunCost, type ModelRunReport } from './usageReport';

export type ReportSeed = { startedAt: number; routingDurationMs?: number; routerRun?: ModelRunReport; detectionRun?: ModelRunReport };
interface Options {
  config: AppConfig;
  activeTabId: string;
  providerSession: ProviderSession;
  tabSessions: MutableRefObject<Map<string, ProviderSession>>;
  tabRequests: MutableRefObject<TabRequestTracker>;
  updateTab: (id: string, update: (tab: ProblemTab) => ProblemTab) => void;
  setLibraryItems: Dispatch<SetStateAction<LibrarySummary[]>>;
  runOperation: <T>(provider: Provider, id: string, token: symbol, work: () => Promise<T>) => Promise<T>;
}
/** One place owns solving, provenance, usage reporting and automatic archiving. */
export function useSolutionLoader({ config, activeTabId, providerSession, tabSessions, tabRequests, updateTab, setLibraryItems, runOperation }: Options) {
  return useCallback(
    async (problem: ProblemInput, targetTabId?: string, sessionOverride?: ProviderSession, reportSeed?: ReportSeed) => {
      const tabId = targetTabId || activeTabId;
      const previousSession = tabSessions.current.get(tabId) || providerSession;
      const session = sessionOverride || (typeof previousSession.fork === 'function' ? previousSession.fork(getLanguage()) : previousSession);
      const startedAt = reportSeed?.startedAt ?? Date.now();
      if (!session.provider) {
        updateTab(tabId, (t) => ({ ...t, errorMessage: session.error }));
        return;
      }
      tabSessions.current.set(tabId, session);
      const requestToken = tabRequests.current.begin(tabId, requestTimeout(config));
      updateTab(tabId, (t) => ({ ...t, isLoading: true, errorMessage: null }));

      try {
        const targetProvider = session.provider;
        const priorRuns = [reportSeed?.routerRun, reportSeed?.detectionRun].filter((run): run is ModelRunReport => Boolean(run));
        targetProvider.setBudgetSpent?.(priorRuns.reduce((total, run) => total + (run.cost?.usd || 0) / (run.sharedAcrossQuestions || 1), 0));
        const raw = await runOperation(targetProvider, tabId, requestToken, () => targetProvider.solve(problem));
        if (!tabRequests.current.isCurrent(tabId, requestToken)) return;
        const metadata = session.createMetadata();
        const assembled = TrustedAssembler.assembleSolution(problem, raw, metadata);
        const runs: ModelRunReport[] = [
          ...(reportSeed?.routerRun ? [reportSeed.routerRun] : []),
          ...(reportSeed?.detectionRun ? [reportSeed.detectionRun] : []),
          withRunCost({ role: 'solution', providerName: metadata.providerName, modelName: metadata.modelName,
            reasoningEffort: metadata.reasoningEffort, usage: session.isDemo
              ? { inputTokens: 0, outputTokens: 0, totalTokens: 0, reportedCalls: 0, unreportedCalls: 0 }
              : session.provider.usageTracker?.snapshot() || { ...EMPTY_USAGE, unreportedCalls: 1 } },
            config, session.provider.usageTracker?.costSnapshot())
        ];
        assembled.executionReport = {
          durationMs: (reportSeed?.routingDurationMs || 0) + Math.max(0, Date.now() - startedAt),
          runs, totalUsage: totalRunUsage(runs)
        };

        // Kütüphaneye otomatik kaydet
        let savedItemId: string | null = null;
        try {
          const item = LibraryStorage.createLibraryItemFromDocument(assembled, [], metadata);
          await LibraryStorage.saveItem(item);
          const updatedItems = await LibraryStorage.getSummaries();
          setLibraryItems(updatedItems);
          savedItemId = item.id;
        } catch (saveErr) {
          console.warn('Kütüphaneye kaydetme uyarısı:', saveErr);
        }

        if (!tabRequests.current.isCurrent(tabId, requestToken)) return;
        updateTab(tabId, (t) => ({
          ...t,
          document: assembled,
          openLayerIds: [],
          focusedNodeId: 'root',
          expansionCache: {},
          tree: INITIAL_TREE,
          selectedEquation: null,
          isLoading: false,
          errorMessage: null,
          activeLibraryItemId: savedItemId
        }));
      } catch (err: unknown) {
        if (!tabRequests.current.isCurrent(tabId, requestToken)) return;
        console.error('Çözüm yükleme hatası:', err);
        const msg = err instanceof Error ? err.message : String(err);
        updateTab(tabId, (t) => ({ ...t, isLoading: false, errorMessage: msg }));
      } finally {
        tabRequests.current.finish(tabId, requestToken);
      }
    },
    [providerSession, activeTabId, updateTab, config, runOperation]
  );

}
