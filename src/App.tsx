import { useLanguage } from './i18n/react';
import { useCompactLayout } from './domain/useCompactLayout';
import { setLanguage } from './i18n';
import { translate } from './i18n';
import { useSolutionLoader, type ReportSeed } from './domain/useSolutionLoader';
import { addNodeToTree, findPathToNode, findParentLayerForBlock } from './domain/solutionTree';
import { restoreExpansions, equationCacheKey, contextualCacheKey } from './domain/expansionState';
import { requestScheduler, requestTimeout, isRequestStopped } from './domain/requestControl';
import type { Provider } from './providers/providerSession';
import { TabRequestTracker } from './domain/tabRequests';
import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  ProblemInput,
  ProblemAttachment,
  SolutionDocument,
  ExpansionLayer,
  EquationBlock,
  DerivationTreeNode,
  ProblemTab,
  RecommendedPath,
  SolutionBlock,
  SolutionSection
} from './domain/types';
import { AppConfig, ConfigManager } from './domain/config';
import { withRunCost, type ModelRunReport } from './domain/usageReport';
import { refreshConfiguredModelCatalogs } from './domain/modelCatalog';
import { TrustedAssembler } from './domain/trustedAssembler';
import { LibraryStorage } from './domain/libraryStorage';
import { useLibraryArchive } from './domain/useLibraryArchive';
import { summarizeLibraryItem, type LibrarySummary } from './domain/librarySummary';
import { createProviderSession, createSessionForSavedSolution, type ProviderSession } from './providers/providerSession';
import { INITIAL_TREE, addParallelPathToTree, deriveContextInquireCacheKey } from './domain/derivationTree';
import { PaperLayout } from './components/PaperLayout';
import { DerivationTreePanel } from './components/DerivationTreePanel';
import { LibraryPanel } from './components/LibraryPanel';
import { MindMapModal } from './components/MindMapModal';
import { ProblemInputModal, SubmitProblemOptions } from './components/ProblemInputModal';
import { ProblemInputTabs } from './components/ProblemInputTabs';
import { ProblemTabBar } from './components/ProblemTabBar';
import { SettingsModal } from './components/SettingsModal';
const ExportModal = lazy(() => import('./components/ExportModal').then(module => ({ default: module.ExportModal })));
import { PrintableReport, PrintableDocumentItem } from './components/PrintableReport';
import { InquireContext } from './components/TextSelectionToolbar';
import {
  RefreshCw,
  GraduationCap,
  Settings,
  AlertCircle,
  Moon,
  Sun,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  BookOpen,
  Library,
  GitFork
} from 'lucide-react';

const INITIAL_PROBLEM: ProblemInput = {
  id: 'pendulum_001',
  text: 'Uzunluğu L olan kütlesiz bir ipe bağlı m kütleli bir noktasal cisimden oluşan basit sarkacın küçük açılar yaklaşımındaki hareket denklemini ve salınım periyodunu türetiniz.',
  createdAt: Date.now()
};

// Çoklu Problem Sekmesi Oluşturucu
function createProblemTab(
  problem: ProblemInput = INITIAL_PROBLEM,
  title?: string,
  initialDocument: SolutionDocument | null = null,
  initialCache: Record<string, ExpansionLayer> = {},
  initialTree: DerivationTreeNode = INITIAL_TREE,
  initialOpenLayerIds: string[] = []
): ProblemTab {
  return {
    id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tabTitle: title || translate("Çalışma 1"),
    problem,
    document: initialDocument,
    expansionCache: initialCache,
    tree: initialTree,
    openLayerIds: initialOpenLayerIds,
    focusedNodeId: 'root',
    selectedEquation: null,
    isLoading: false,
    errorMessage: null,
    activeLibraryItemId: null
  };
}

type SubmittedProblem = { text: string; title?: string; attachments?: ProblemAttachment[]; splitFilesIntoTabs?: boolean } | string;
type MultipleSubmittedProblems = Array<{ text: string; title?: string; attachments?: ProblemAttachment[] }>;


export function App() {
  const language = useLanguage();
  useEffect(() => { setLanguage(language); }, [language]);
  const [config, setConfig] = useState<AppConfig>(() => ConfigManager.getConfig());
  const tabSessions = useRef(new Map<string, ProviderSession>());

  useEffect(() => {
    void refreshConfiguredModelCatalogs(config);
    // Kataloglar yalnızca uygulama açılışında yenilenir; elle yenileme Ayarlar'dadır.
  }, []);

  // Koyu / Açık Mod Yönetimi
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('katmandu_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      window.document.documentElement.classList.add('dark');
    } else {
      window.document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('katmandu_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Çoklu Problem ve Sekme Yönetimi
  const [tabs, setTabs] = useState<ProblemTab[]>([
    createProblemTab({ ...INITIAL_PROBLEM, text: translate(INITIAL_PROBLEM.text) }, translate("Çalışma 1"))
  ]);
  const tabRequests = useRef(new TabRequestTracker());
  useEffect(() => {
    const tracker = tabRequests.current;
    return () => tracker.clear();
  }, []);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);

  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || tabs[0];
  }, [tabs, activeTabId]);

  const updateTab = useCallback(
    (tabId: string, updater: (prevTab: ProblemTab) => ProblemTab) => {
      setTabs((prev) => prev.map((t) => (t.id === tabId ? updater(t) : t)));
    },
    []
  );

  useEffect(() => {
    requestScheduler.limit = Math.max(1, Math.min(4, config.maxConcurrentRequests || 2));
  }, [config.maxConcurrentRequests]);
  const runOperation = useCallback(<T,>(targetProvider: Provider, tabId: string, token: symbol, task: () => Promise<T>) => {
    const signal = tabRequests.current.signal(tabId, token);
    return requestScheduler.run(signal, () => {
      targetProvider.setRequestSignal?.(signal);
      return task();
    });
  }, []);
  const handleStopOperation = () => {
    tabRequests.current.cancel(activeTabId);
    updateTab(activeTabId, t => ({ ...t, isLoading: false, solvingPathId: null, expandingBlockId: null,
      errorMessage: translate("İşlem durduruldu.") }));
  };

  // Aktif sekmenin durum türevleri
  const document = activeTab.document;
  const expansionCache = activeTab.expansionCache;
  const tree = activeTab.tree;
  const openLayerIds = useMemo(
    () => new Set(activeTab.openLayerIds),
    [activeTab.openLayerIds]
  );
  const focusedNodeId = activeTab.focusedNodeId;
  const selectedEquation = activeTab.selectedEquation;
  const isLoading = activeTab.isLoading;
  const errorMessage = activeTab.errorMessage;
  const currentProblem = activeTab.problem;
  const activeLibraryItemId = activeTab.activeLibraryItemId;

  // Aktif sekme için uyumlu durum değiştiriciler (dispatchers)

  const setOpenLayerIds = useCallback(
    (action: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      updateTab(activeTabId, (t) => {
        const currentSet = new Set(t.openLayerIds);
        const nextSet = typeof action === 'function' ? action(currentSet) : action;
        return {
          ...t,
          openLayerIds: Array.from(nextSet)
        };
      });
    },
    [activeTabId, updateTab]
  );

  const setFocusedNodeId = useCallback(
    (id: string) => {
      updateTab(activeTabId, (t) => ({ ...t, focusedNodeId: id }));
    },
    [activeTabId, updateTab]
  );

  const setSelectedEquation = useCallback(
    (eq: EquationBlock | null) => {
      updateTab(activeTabId, (t) => ({ ...t, selectedEquation: eq }));
    },
    [activeTabId, updateTab]
  );

  const setIsLoading = useCallback(
    (loading: boolean) => {
      updateTab(activeTabId, (t) => ({ ...t, isLoading: loading }));
    },
    [activeTabId, updateTab]
  );

  const setErrorMessage = useCallback(
    (msg: string | null) => {
      updateTab(activeTabId, (t) => ({ ...t, errorMessage: msg }));
    },
    [activeTabId, updateTab]
  );


  const expandingBlockId = activeTab.expandingBlockId || null;
  const setExpandingBlockId = (id: string | null) => {
    updateTab(activeTabId, t => ({ ...t, expandingBlockId: id }));
  };
  const solvingPathId = activeTab.solvingPathId || null;
  const setSolvingPathId = (id: string | null) => updateTab(activeTabId, t => ({ ...t, solvingPathId: id }));
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMindMapOpen, setIsMindMapOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Baskı / PDF için durumlar
  const [printableLayers, setPrintableLayers] = useState<ExpansionLayer[]>([]);
  const [printableMaxDepth, setPrintableMaxDepth] = useState<number>(0);
  const [printableMultiItems, setPrintableMultiItems] = useState<PrintableDocumentItem[] | null>(null);

  const handlePreparePrint = useCallback((layers: ExpansionLayer[], depth: number) => {
    setPrintableMultiItems(null);
    setPrintableLayers(layers);
    setPrintableMaxDepth(depth);
  }, []);

  const handlePrepareMultiPrint = useCallback((items: PrintableDocumentItem[]) => {
    setPrintableMultiItems(items);
  }, []);

  const mainScrollRef = useRef<HTMLElement>(null);
  const compactLayout = useCompactLayout();
  const [mobileView, setMobileView] = useState<'solution' | 'library' | 'tree'>('solution');

  // Kütüphane ve Çözüm Geçmişi Durumu
  const { items: libraryItems, setItems: setLibraryItems, status: archiveStatus } = useLibraryArchive();
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('katmandu_library_open');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('katmandu_library_open', String(isLibraryOpen));
    } catch {}
  }, [isLibraryOpen]);

  // Çözüm (Paper) Zoom Durumu: %50 - %200
  const [paperZoom, setPaperZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('katmandu_paper_zoom');
      if (saved) {
        const val = parseFloat(saved);
        if (val >= 0.5 && val <= 2.0) return val;
      }
    } catch {}
    return 1;
  });

  useEffect(() => {
    try {
      localStorage.setItem('katmandu_paper_zoom', String(paperZoom));
    } catch {}
  }, [paperZoom]);

  const handleSolutionWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setPaperZoom((z) => {
        const next = Math.round((z + delta) * 10) / 10;
        return Math.max(0.5, Math.min(2.0, next));
      });
    }
  };

  const providerSession = useMemo(() => createProviderSession(config), [config, language]);
  const activeProviderSession = tabSessions.current.get(activeTabId) || providerSession;
  const { provider } = activeProviderSession;

  const loadSolution = useSolutionLoader({ config, activeTabId, providerSession, tabSessions, tabRequests,
    updateTab, setLibraryItems, runOperation });

  // Kütüphaneden bir çözüm seçildiğinde
  const handleSelectLibraryItem = async (summary: LibrarySummary) => {
    let item;
    try { item = await LibraryStorage.getItem(summary.id); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : translate("Arşiv kaydı okunamadı.")); return; }
    if (!item) { setErrorMessage(translate("Arşiv kaydı bulunamadı veya okunamadı.")); return; }
    const existingTabIndex = tabs.findIndex((t) => t.activeLibraryItemId === item.id);
    if (existingTabIndex >= 0) {
      setActiveTabId(tabs[existingTabIndex].id);
      return;
    }

    const { tree: reconstructedTree, cache } = restoreExpansions(item.document, item.layers || []);
    const savedSession = createSessionForSavedSolution(config, item.document.metadata);

    if (!activeTab.document && !activeTab.isLoading) {
      if (savedSession) tabSessions.current.set(activeTab.id, savedSession);
      else tabSessions.current.delete(activeTab.id);
      updateTab(activeTab.id, (t) => ({
        ...t,
        problem: { id: item.document.problemId, text: item.problemText, attachments: item.document.attachments, createdAt: item.createdAt },
        document: item.document,
        expansionCache: cache,
        tree: reconstructedTree,
        openLayerIds: item.layers?.map((l) => l.id) || [],
        focusedNodeId: 'root',
        selectedEquation: null,
        activeLibraryItemId: item.id
      }));
    } else {
      const newTab: ProblemTab = {
        id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tabTitle: translate("Soru {0}", [tabs.length + 1]),
        problem: { id: item.document.problemId, text: item.problemText, attachments: item.document.attachments, createdAt: item.createdAt },
        document: item.document,
        expansionCache: cache,
        tree: reconstructedTree,
        openLayerIds: item.layers?.map((l) => l.id) || [],
        focusedNodeId: 'root',
        selectedEquation: null,
        isLoading: false,
        errorMessage: null,
        activeLibraryItemId: item.id
      };
      if (savedSession) tabSessions.current.set(newTab.id, savedSession);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }

    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Kütüphaneden bir çözüm silindiğinde
  const handleDeleteLibraryItem = async (id: string) => {
    try {
      await LibraryStorage.deleteItem(id);
      setLibraryItems((prev) => prev.filter((i) => i.id !== id));
      setTabs((prev) =>
        prev.map((t) => (t.activeLibraryItemId === id ? { ...t, activeLibraryItemId: null } : t))
      );
    } catch (err) {
      console.error('Kütüphane öğesi silme hatası:', err);
    }
  };

  // Ayarlar kaydedildiğinde
  const handleSaveConfig = (newConfig: AppConfig) => {
    newConfig = { ...newConfig, modelSelectionMode: 'manual' };
    tabSessions.current.clear();
    setConfig(newConfig);
    ConfigManager.saveConfig(newConfig);
  };

  // Katman akordeonunu açma / kapama
  const handleToggleLayer = (layerId: string) => {
    setOpenLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  // Katmanları hedef aldıkları blok kimliğine (targetBlockId) göre grupla
  const layersByTargetId = useMemo(() => {
    const map: Record<string, ExpansionLayer[]> = {};
    for (const layer of Object.values(expansionCache)) {
      const key = layer.targetBlockId || 'root';
      if (!map[key]) map[key] = [];
      if (!map[key].some((l) => l.id === layer.id)) {
        map[key].push(layer);
      }
    }
    return map;
  }, [expansionCache]);

  // Odaklanılmış düğümün derinliği
  const focusedNodeDepth = useMemo(() => {
    if (focusedNodeId === 'root') return 0;
    const path = findPathToNode(tree, focusedNodeId);
    return path ? path[path.length - 1].depth : 1;
  }, [tree, focusedNodeId]);

  // Denklem seçildiğinde yerinde (inline) derinleşme
  const handleSelectEquation = async (equation: EquationBlock) => {
    if (!document || isLoading) return;
    if (!provider) {
      setErrorMessage(activeProviderSession.error);
      return;
    }

    const currentTabId = activeTabId;
    setSelectedEquation(equation);

    // Bu denklem bir üst katmanın içinde mi yoksa ana dokümanda mı?
    const parentLayer = findParentLayerForBlock(expansionCache, equation.id);
    let parentKey = parentLayer ? parentLayer.id : 'root';
    const nextDepth = parentLayer ? parentLayer.depth + 1 : 1;

    let parentSectionTitle = translate("Ana Çözüm");
    if (parentLayer) {
      parentSectionTitle = parentLayer.title;
    } else {
      const foundSec = document.sections.find((s) => s.blocks.some((b) => b.id === equation.id));
      if (foundSec) {
        parentSectionTitle = foundSec.title;
        if (foundSec.id.startsWith('sec_path_')) {
          parentKey = foundSec.id.replace('sec_', '');
        }
      }
    }

    const cacheKey = equationCacheKey(parentKey, equation);

    // Hafıza (Cache) Kontrolü: Bu denklem daha önce açıldıysa yeniden API çağırma!
    if (expansionCache[cacheKey]) {
      const cached = expansionCache[cacheKey];
      updateTab(currentTabId, (t) => ({
        ...t,
        tree: addNodeToTree(t.tree, parentKey, {
          id: cached.id,
          parentId: parentKey,
          label: cached.title,
          depth: nextDepth,
          targetDisplayNumber: equation.displayNumber,
          targetBlockId: equation.id,
          isAxiomatic: cached.isAxiomatic,
          axiomType: cached.axiomType,
          layer: cached
        }),
        openLayerIds: Array.from(new Set([...t.openLayerIds, cached.id])),
        focusedNodeId: cached.id
      }));

      setTimeout(() => {
        window.document.getElementById(cached.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    const requestToken = tabRequests.current.begin(activeTabId, requestTimeout(config));
    setExpandingBlockId(equation.id);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const ancestorNodes = findPathToNode(tree, parentKey) || [];
      const ancestorPath = ancestorNodes.map((n) => n.label);
      const parentLayer = parentKey !== 'root' ? Object.values(activeTab.expansionCache).find(l => l.id === parentKey) : undefined;
      const solutionContext = TrustedAssembler.buildSolutionContext(
        document,
        parentSectionTitle,
        equation.id,
        parentLayer
      );

      const rawExp = await runOperation(provider, activeTabId, requestToken, () => provider.expand({
        problemText: document.problemText,
        solutionContext,
        parentSectionTitle,
        targetBlock: equation,
        depth: nextDepth,
        ancestorPath
      }));

      if (!tabRequests.current.isCurrent(activeTabId, requestToken)) return;
      const layer = TrustedAssembler.assembleExpansionLayer(
        rawExp,
        nextDepth,
        equation.id,
        equation.displayNumber,
        undefined,
        parentKey,
        cacheKey,
        activeProviderSession.createMetadata().language
      );

      layer.parentLayerId = parentKey;
      // Hafızaya çift indeksleme ile kaydet, dallanma ağacına ekle ve açık katmanlar kümesine ekle
      updateTab(currentTabId, (t) => {
        const nextCache = { ...t.expansionCache, [cacheKey]: layer };
        const nextTree = addNodeToTree(t.tree, parentKey, {
          id: layer.id,
          parentId: parentKey,
          label: layer.title,
          depth: nextDepth,
          targetDisplayNumber: equation.displayNumber,
          targetBlockId: equation.id,
          isAxiomatic: layer.isAxiomatic,
          axiomType: layer.axiomType,
          layer
        });
        const nextOpenLayers = Array.from(new Set([...t.openLayerIds, layer.id]));
        return {
          ...t,
          expansionCache: nextCache,
          tree: nextTree,
          openLayerIds: nextOpenLayers,
          focusedNodeId: layer.id
        };
      });

      // Kütüphanedeki aktif çözümü güncel katmanlarla senkronize et
      if (activeLibraryItemId && document) {
        const allLayers = [...Object.values(expansionCache), layer];
        const unique = Array.from(new Map(allLayers.map((l) => [l.id, l])).values());
        const updated = await LibraryStorage.updateLayers(activeLibraryItemId, unique);
        if (updated) setLibraryItems(prev => prev.map(it => it.id === updated.id ? summarizeLibraryItem(updated) : it));
      }
      setTimeout(() => {
        window.document.getElementById(layer.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch (err: unknown) {
      if (!tabRequests.current.isCurrent(activeTabId, requestToken)) return;
      console.error('Genişletme hatası:', err);
      const msg = err instanceof Error ? err.message : String(err);
      updateTab(currentTabId, (t) => ({ ...t, errorMessage: msg }));
    } finally {
      if (tabRequests.current.isCurrent(activeTabId, requestToken)) {
        setIsLoading(false);
        setExpandingBlockId(null);
        tabRequests.current.finish(activeTabId, requestToken);
      }
    }
  };

  // Serbest metin seçilerek veya sağ tıklanarak bağlamsal soru sorulduğunda yerinde (inline) türetim
  const handleContextualInquire = async (
    selectedText: string,
    customQuery?: string,
    context?: InquireContext
  ) => {
    if (!document || isLoading) return;
    if (!provider) {
      setErrorMessage(activeProviderSession.error);
      return;
    }

    const currentTabId = activeTabId;
    let targetBlockId: string | undefined = context?.blockId;
    let parentKey = 'root';
    let parentSectionTitle = translate("Ana Çözüm");
    let nextDepth = 1;

    // 1. Durum: Kullanıcı açılmış bir katman (layerId) içindeki bir ifadeyi seçti/sağ tıkladı
    if (context?.layerId) {
      const parentLayer = Object.values(expansionCache).find((l) => l.id === context.layerId);
      if (parentLayer) {
        parentKey = parentLayer.id;
        nextDepth = parentLayer.depth + 1;
        parentSectionTitle = parentLayer.title;

        if (!targetBlockId) {
          const matchingBlock = parentLayer.blocks.find(
            (b) =>
              (b.kind === 'prose' && b.text.includes(selectedText)) ||
              (b.kind === 'equation' && (b.latex.includes(selectedText) || selectedText.includes(b.latex)))
          );
          targetBlockId = matchingBlock ? matchingBlock.id : parentLayer.id;
        }
      }
    }

    // 2. Durum: context.layerId doğrudan gelmediyse, açık olan katmanların bloklarını tara
    if (parentKey === 'root') {
      for (const layer of Object.values(expansionCache)) {
        if (!openLayerIds.has(layer.id)) continue;
        const matchingBlock = layer.blocks.find(
          (b) =>
            context?.blockId
              ? b.id === context.blockId
              : (b.kind === 'prose' && b.text.includes(selectedText)) ||
                (b.kind === 'equation' && (b.latex.includes(selectedText) || selectedText.includes(b.latex)))
        );
        if (matchingBlock) {
          parentKey = layer.id;
          nextDepth = layer.depth + 1;
          parentSectionTitle = layer.title;
          targetBlockId = matchingBlock.id;
          break;
        }
      }
    }

    // 3. Durum: Ana belgedeki (root) bölümleri ve blokları tara
    if (parentKey === 'root') {
      if (context?.blockId) {
        const foundSec = document.sections.find((s) => s.blocks.some((b) => b.id === context.blockId));
        if (foundSec) {
          targetBlockId = context.blockId;
          parentSectionTitle = foundSec.title;
          if (foundSec.id.startsWith('sec_path_')) {
            parentKey = foundSec.id.replace('sec_', '');
          }
        }
      }

      if (!targetBlockId) {
        for (const sec of document.sections) {
          for (const b of sec.blocks) {
            if (
              (b.kind === 'prose' && b.text.includes(selectedText)) ||
              (b.kind === 'equation' && (b.latex.includes(selectedText) || selectedText.includes(b.latex)))
            ) {
              targetBlockId = b.id;
              parentSectionTitle = sec.title;
              break;
            }
          }
          if (targetBlockId) break;
        }
      }

      if (!targetBlockId) {
        const matchedSec = document.sections.find((s) => s.title.includes(selectedText));
        if (matchedSec) {
          targetBlockId = matchedSec.id;
          parentSectionTitle = matchedSec.title;
        } else {
          targetBlockId = 'root';
        }
      }
    }

    const queryLabel = customQuery || selectedText;
    const finalTargetBlockId = targetBlockId || 'root';
    const canonicalKey = contextualCacheKey(parentKey, targetBlockId, selectedText, customQuery);
    const legacyKey = deriveContextInquireCacheKey(parentKey, finalTargetBlockId, selectedText, customQuery);
    const cacheKey = expansionCache[canonicalKey] ? canonicalKey : expansionCache[legacyKey] ? legacyKey : canonicalKey;

    if (expansionCache[cacheKey]) {
      const cached = expansionCache[cacheKey];
      updateTab(currentTabId, (t) => {
        const nextOpenSet = new Set(t.openLayerIds);
        if (parentKey !== 'root') {
          nextOpenSet.add(parentKey);
        }
        nextOpenSet.add(cached.id);
        return {
          ...t,
          tree: addNodeToTree(t.tree, parentKey, {
            id: cached.id,
            parentId: parentKey,
            label: queryLabel,
            depth: nextDepth,
            targetBlockId: finalTargetBlockId,
            contextualQuery: queryLabel,
            isAxiomatic: cached.isAxiomatic,
            axiomType: cached.axiomType,
            layer: cached
          }),
          openLayerIds: Array.from(nextOpenSet),
          focusedNodeId: cached.id
        };
      });
      setTimeout(() => {
        window.document.getElementById(cached.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    const requestToken = tabRequests.current.begin(activeTabId, requestTimeout(config));
    setExpandingBlockId(targetBlockId || null);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const ancestorNodes = findPathToNode(tree, parentKey) || [];
      const ancestorPath = ancestorNodes.map((n) => n.label);
      const parentLayer = parentKey !== 'root' ? Object.values(activeTab.expansionCache).find(l => l.id === parentKey) : undefined;
      const solutionContext = TrustedAssembler.buildSolutionContext(
        document,
        parentSectionTitle,
        finalTargetBlockId,
        parentLayer
      );

      const rawExp = await runOperation(provider, activeTabId, requestToken, () => provider.expand({
        problemText: document.problemText,
        solutionContext,
        parentSectionTitle,
        contextualInquiry: {
          selectedText,
          userQuery: customQuery
        },
        depth: nextDepth,
        ancestorPath
      }));

      if (!tabRequests.current.isCurrent(activeTabId, requestToken)) return;
      const layer = TrustedAssembler.assembleExpansionLayer(
        rawExp,
        nextDepth,
        finalTargetBlockId,
        undefined,
        queryLabel,
        parentKey,
        cacheKey,
        activeProviderSession.createMetadata().language
      );

      layer.parentLayerId = parentKey;
      layer.requestContext = { selectedText, userQuery: customQuery };
      updateTab(currentTabId, (t) => {
        const nextCache = { ...t.expansionCache, [cacheKey]: layer };
        const nextTree = addNodeToTree(t.tree, parentKey, {
          id: layer.id,
          parentId: parentKey,
          label: queryLabel,
          depth: nextDepth,
          targetBlockId,
          contextualQuery: queryLabel,
          isAxiomatic: layer.isAxiomatic,
          axiomType: layer.axiomType,
          layer
        });
        const nextOpenSet = new Set(t.openLayerIds);
        if (parentKey !== 'root') {
          nextOpenSet.add(parentKey);
        }
        nextOpenSet.add(layer.id);
        return {
          ...t,
          expansionCache: nextCache,
          tree: nextTree,
          openLayerIds: Array.from(nextOpenSet),
          focusedNodeId: layer.id
        };
      });

      if (activeLibraryItemId && document) {
        const allLayers = [...Object.values(expansionCache), layer];
        const unique = Array.from(new Map(allLayers.map((l) => [l.id, l])).values());
        const updated = await LibraryStorage.updateLayers(activeLibraryItemId, unique);
        if (updated) setLibraryItems(prev => prev.map(it => it.id === updated.id ? summarizeLibraryItem(updated) : it));
      }

      setTimeout(() => {
        window.document.getElementById(layer.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch (err: unknown) {
      if (!tabRequests.current.isCurrent(activeTabId, requestToken)) return;
      console.error('Bağlamsal sorgu hatası:', err);
      const msg = err instanceof Error ? err.message : String(err);
      updateTab(currentTabId, (t) => ({ ...t, errorMessage: msg }));
    } finally {
      if (tabRequests.current.isCurrent(activeTabId, requestToken)) {
        setIsLoading(false);
        setExpandingBlockId(null);
        tabRequests.current.finish(activeTabId, requestToken);
      }
    }
  };

  // Dallanma Ağacındaki Herhangi Bir Düğüme Tıklandığında Yerinde O Konuma Gitme
  const handleSelectTreeNode = (nodeId: string) => {
    setFocusedNodeId(nodeId);
    if (nodeId === 'root') {
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Alternatif Çözüm Yolu kökü seçildiyse (Örn: path_2) doğrudan o bölüme kaydır
    if (nodeId.startsWith('path_')) {
      const targetSecId = `sec_${nodeId}`;
      const secEl = window.document.getElementById(targetSecId);
      if (secEl) {
        secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    const pathNodes = findPathToNode(tree, nodeId);
    if (pathNodes) {
      setOpenLayerIds((prev) => {
        const next = new Set(prev);
        for (const p of pathNodes) {
          if (p.id !== 'root') next.add(p.id);
        }
        return next;
      });
    }

    setTimeout(() => {
      window.document.getElementById(nodeId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  // Alternatif Çözüm Yolu Çözme (2. Yol, 3. Yol - İsteğe Bağlı & Paralel Kök)
  const handleSolveAlternativePath = async (path: RecommendedPath) => {
    if (!document || solvingPathId || isLoading) return;
    if (!provider) {
      setErrorMessage(activeProviderSession.error);
      return;
    }
    const requestToken = tabRequests.current.begin(activeTabId, requestTimeout(config));
    setIsLoading(true);

    const currentTabId = activeTabId;
    setSolvingPathId(path.id);
    setErrorMessage(null);

    try {
      const currentDoc = activeTab.document;
      if (!currentDoc) return;

      const altPrompt = translate("{0}\n\n[ÇÖZÜM YÖNTEMİ VE YOLU]: {1}\nLütfen bu problemi {2} yöntemini kullanarak, yukarıda verilen 1. yol ana çözümden bağımsız tam bir akademik çözüm olarak adımlarıyla baştan türetiniz.", [currentDoc.problemText, path.query, path.methodName]);

      const altProblemInput: ProblemInput = {
        id: `${currentDoc.problemId}_${path.id}`,
        text: altPrompt,
        attachments: currentDoc.attachments,
        createdAt: Date.now()
      };

      const rawResponse = await runOperation(provider, currentTabId, requestToken, () => provider.solve(altProblemInput));
      if (!tabRequests.current.isCurrent(currentTabId, requestToken)) return;

      // Devam eden denklem numaralandırması ve blok kimlikleri
      let startingEqNum = currentDoc.totalEquations || 0;
      let blockCounter = 0;
      const newSectionId = `sec_${path.id}`;

      // Ham yanıttan blokları topla
      const rawBlocks: any[] = [];
      if (rawResponse.sections && rawResponse.sections.length > 0) {
        for (const s of rawResponse.sections) {
          if (s && s.blocks) rawBlocks.push(...s.blocks);
        }
      } else if ((rawResponse as any).blocks) {
        rawBlocks.push(...(rawResponse as any).blocks);
      }

      // Güvenilir blok montajı
      const assembledBlocks: SolutionBlock[] = [];
      for (const rb of rawBlocks) {
        const blks = TrustedAssembler.assembleBlocks(
          rb,
          newSectionId,
          () => {
            blockCounter++;
            return `${newSectionId}_b${blockCounter}`;
          },
          () => {
            startingEqNum++;
            return startingEqNum;
          }
        );
        assembledBlocks.push(...blks);
      }

      const newSection: SolutionSection = {
        id: newSectionId,
        title: `${path.badge || translate("2. Yol")}: ${path.methodName}`,
        blocks: assembledBlocks
      };

      // Dokümanı güncelle: 2. yolu en alta ekle, path.solved = true yap
      const updatedRecommendedPaths = (currentDoc.recommendedPaths || []).map((rp) =>
        rp.id === path.id ? { ...rp, solved: true } : rp
      );

      const updatedDocument: SolutionDocument = {
        ...currentDoc,
        sections: [...currentDoc.sections, newSection],
        totalEquations: startingEqNum,
        recommendedPaths: updatedRecommendedPaths
      };

      // Ağaca ekle: Ana çözüm ile aynı seviyede (depth: 0) paralel kök düğümü olarak ekle
      updateTab(currentTabId, (t) => {
        const nextTree = addParallelPathToTree(t.tree, {
          id: path.id,
          parentId: null,
          label: `${path.badge ? path.badge.replace(/^[^\s]+\s*/, '') : translate("2. Yol")}: ${path.methodName}`,
          depth: 0,
          nodeType: 'alternative_solution',
          pathMethodName: path.methodName
        });

        return {
          ...t,
          document: updatedDocument,
          tree: nextTree,
          focusedNodeId: path.id
        };
      });

      if (activeLibraryItemId) {
        const saved = await LibraryStorage.getItem(activeLibraryItemId);
        if (!tabRequests.current.isCurrent(currentTabId, requestToken)) return;
        if (saved) {
          const updated = { ...saved, document: updatedDocument };
          await LibraryStorage.saveItem(updated);
          setLibraryItems(prev => prev.map(item => item.id === updated.id ? summarizeLibraryItem(updated) : item));
        }
      }

      // Otomatik olarak yeni 2. Yol bölümüne kaydır
      setTimeout(() => {
        window.document.getElementById(newSectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      if (!tabRequests.current.isCurrent(currentTabId, requestToken)) return;
      console.error('Alternatif yol çözülürken hata:', err);
      setErrorMessage(translate("Alternatif yol çözülürken bir hata oluştu: {0}", [err?.message || String(err)]));
    } finally {
      if (tabRequests.current.isCurrent(currentTabId, requestToken)) {
        setSolvingPathId(null);
        setIsLoading(false);
        tabRequests.current.finish(currentTabId, requestToken);
      }
    }
  };

  // Çoklu problem gönderimi (ör. "---" veya "Soru 1, Soru 2" ile ayrılmış sorular veya tek belgede tespit edilen sorular)
  const handleSubmitMultipleProblems = (
    payloads: MultipleSubmittedProblems,
    sessionOverride?: ProviderSession,
    reportSeed?: ReportSeed
  ) => {
    if (!payloads || payloads.length === 0) return;
    setMobileView('solution');
    const session = sessionOverride || createProviderSession(config);
    if (!session.provider) {
      setErrorMessage(session.error);
      return;
    }

    let currentTabsCount = tabs.length;
    const newTabs: ProblemTab[] = [];
    const problemsToSolve: Array<{ problem: ProblemInput; tabId: string }> = [];

    const useActiveForFirst = !activeTab.document;

    payloads.forEach((item, idx) => {
      const problem: ProblemInput = {
        id: `prob_${Date.now()}_${idx}`,
        text: item.text,
        title: item.title,
        attachments: item.attachments,
        createdAt: Date.now()
      };

      const customTitle =
        item.title && item.title.trim()
          ? item.title.trim()
          : translate("Soru {0}", [currentTabsCount + 1]);

      if (idx === 0 && useActiveForFirst) {
        updateTab(activeTabId, (t) => ({
          ...t,
          problem,
          tabTitle:
            item.title && item.title.trim()
              ? item.title.trim()
              : translate("Soru {0}", [tabs.findIndex((x) => x.id === activeTabId) + 1 || 1])
        }));
        problemsToSolve.push({ problem, tabId: activeTabId });
      } else {
        currentTabsCount += 1;
        const tab = createProblemTab(problem, customTitle);
        newTabs.push(tab);
        problemsToSolve.push({ problem, tabId: tab.id });
      }
    });

    if (newTabs.length > 0) {
      setTabs((prev) => [...prev, ...newTabs]);
      if (!useActiveForFirst) {
        setActiveTabId(newTabs[0].id);
      }
    }

    // Bağımsız ve paralel yüklemeyi başlat
    const sharedCount = problemsToSolve.length;
    const preprocessing = session.provider.usageTracker?.snapshot();
    const detectionRun: ModelRunReport | undefined = preprocessing && (preprocessing.reportedCalls || preprocessing.unreportedCalls)
      ? withRunCost({ role: 'detection', providerName: session.createMetadata().providerName,
          modelName: session.createMetadata().modelName, reasoningEffort: session.createMetadata().reasoningEffort,
          usage: preprocessing, sharedAcrossQuestions: sharedCount > 1 ? sharedCount : undefined },
        config, session.provider.usageTracker?.costSnapshot())
      : undefined;
    problemsToSolve.forEach(({ problem, tabId }) => {
      const routerRun = reportSeed?.routerRun && sharedCount > 1
        ? { ...reportSeed.routerRun, sharedAcrossQuestions: sharedCount } : reportSeed?.routerRun;
      loadSolution(problem, tabId, session.fork(), {
        startedAt: reportSeed?.startedAt ?? Date.now(), routingDurationMs: reportSeed?.routingDurationMs,
        routerRun, detectionRun
      });
    });
  };

  // Yeni problem gönderme (Metin, Görsel veya PDF)
  // Farklı bir soru tespit edildiği anda otomatik olarak yeni sekmede çözer
  const handleSubmitNewProblem = async (
    payload: SubmittedProblem,
    options?: SubmitProblemOptions,
    sessionOverride?: ProviderSession,
    reportSeed?: ReportSeed
  ) => {
    setMobileView('solution');
    const session = sessionOverride || createProviderSession(config);
    const startedAt = reportSeed?.startedAt ?? Date.now();
    const submitProvider = session.provider;
    if (!submitProvider) {
      setErrorMessage(session.error);
      return;
    }
    const text = typeof payload === 'string' ? payload : payload.text;
    const attachments = typeof payload === 'object' ? payload.attachments : undefined;
    const splitFiles = typeof payload === 'object' ? payload.splitFilesIntoTabs : false;
    const inputToken = tabRequests.current.begin(activeTabId, requestTimeout(config));
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // DeepSeek doğrudan görsel analizini desteklemez - erken kontrol
      const hasImages = attachments?.some((a) => a.type === 'image');
      const hasPdfs = attachments?.some((a) => a.type === 'pdf');
      if (session.createMetadata().providerName === 'DeepSeek' && hasImages && !text?.trim() && !hasPdfs) {
        updateTab(activeTabId, (t) => ({
          ...t,
          errorMessage:
            translate("DeepSeek modeli doğrudan görsel (PNG/JPG) analizini desteklememektedir. Lütfen soruyu metin/LaTeX olarak yazın veya PDF belgesi yükleyin (Görselden DeepSeek hibrit çözüm desteği yakında eklenecektir).")
        }));
        return;
      }

      // 1. Çoklu dosya yüklenip sekmelere ayırma seçildiyse:
      if (splitFiles && attachments && attachments.length > 1) {
        const batchPayloads: Array<{ text: string; title?: string; attachments?: ProblemAttachment[] }> = [];

        for (let idx = 0; idx < attachments.length; idx++) {
          const att = attachments[idx];
          const singleProblem: ProblemInput = {
            id: `prob_att_${Date.now()}_${idx}`,
            text: text || '',
            attachments: [att],
            createdAt: Date.now()
          };

          // Her dosyanın içinde de birden fazla soru olup olmadığını kontrol et
          if (submitProvider.detectQuestions) {
            try {
              const detected = await runOperation(submitProvider, activeTabId, inputToken, () => submitProvider.detectQuestions!(singleProblem));
              if (!tabRequests.current.isCurrent(activeTabId, inputToken)) return;
              if (detected.length > 1) {
                for (const q of detected) {
                  batchPayloads.push({
                    text: [q.instruction, q.rawText || text].filter(Boolean).join('\n\n'),
                    title: q.title,
                    attachments: [att]
                  });
                }
                continue;
              }
            } catch (err) {
              if (!tabRequests.current.isCurrent(activeTabId, inputToken)) return;
              if (isRequestStopped(err)) { setErrorMessage(err instanceof Error ? err.message : String(err)); return; }
              if (att.type === 'pdf') {
                setErrorMessage(err instanceof Error ? err.message : String(err));
                return;
              }
              console.warn('Dosya içi soru tespiti hatası:', err);
            }
          }

          batchPayloads.push({
            text: text ? translate("{0} (Soru: {1})", [text, att.name]) : translate("Görsel / Doküman Problemi: {0}", [att.name]),
            title: translate("Soru {0}: {1}", [idx + 1, att.name.replace(/\.[^/.]+$/, '')]),
            attachments: [att]
          });
        }

        handleSubmitMultipleProblems(batchPayloads, session, { ...reportSeed, startedAt });
        return;
      }

      // 2. Tek bir görsel, PDF veya metin yüklendiğinde:
      // AI otomatik soru ayrıştırmasını çalıştır
      const baseProblem: ProblemInput = {
        id: `prob_${Date.now()}`,
        text,
        attachments,
        createdAt: Date.now()
      };

      if (submitProvider.detectQuestions) {
        try {
          const detected = await runOperation(submitProvider, activeTabId, inputToken, () => submitProvider.detectQuestions!(baseProblem));
          if (!tabRequests.current.isCurrent(activeTabId, inputToken)) return;
          if (detected.length > 1) {
            // Birden fazla soru tespit edildi! Her biri için ayrı sekme aç:
            const batchPayloads = detected.map((q) => ({
              text: [q.instruction, q.rawText || text].filter(Boolean).join('\n\n'),
              title: q.title,
              attachments
            }));
            handleSubmitMultipleProblems(batchPayloads, session, { ...reportSeed, startedAt });
            return;
          }
        } catch (err) {
          if (!tabRequests.current.isCurrent(activeTabId, inputToken)) return;
          if (isRequestStopped(err)) { setErrorMessage(err instanceof Error ? err.message : String(err)); return; }
          if (attachments?.some(a => a.type === 'pdf')) {
            setErrorMessage(err instanceof Error ? err.message : String(err));
            return;
          }
          console.warn('Otomatik soru ayrıştırma uyarısı (fail-soft):', err);
        }
      }

      // 3. Tek soru durumu:
      const shouldOpenNewTab = options?.openInNewTab ?? Boolean(activeTab.document);

      if (shouldOpenNewTab) {
        const nextIndex = tabs.length + 1;
        const newTab = createProblemTab(baseProblem, translate("Soru {0}", [nextIndex]));
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
        loadSolution(baseProblem, newTab.id, session, { ...reportSeed, startedAt });
      } else {
        updateTab(activeTabId, (t) => ({
          ...t,
          problem: baseProblem,
          tabTitle: t.tabTitle || translate("Soru {0}", [tabs.findIndex((x) => x.id === activeTabId) + 1 || 1])
        }));
        loadSolution(baseProblem, activeTabId, session, { ...reportSeed, startedAt });
      }
    } finally {
      if (tabRequests.current.isCurrent(activeTabId, inputToken)) {
        setIsLoading(false);
        tabRequests.current.finish(activeTabId, inputToken);
      }
    }
  };

  // Yeni boş sekme açma
  const handleNewTab = () => {
    const nextIndex = tabs.length + 1;
    const blankProblem: ProblemInput = {
      id: `prob_${Date.now()}`,
      text: '',
      createdAt: Date.now()
    };
    const newTab = createProblemTab(blankProblem, translate("Çalışma {0}", [nextIndex]));
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // Sekme kapatma
  const handleCloseTab = (tabId: string) => {
    tabRequests.current.cancel(tabId);
    tabSessions.current.delete(tabId);
    if (tabs.length <= 1) {
      const resetTab = createProblemTab(
        { id: `prob_${Date.now()}`, text: '', createdAt: Date.now() },
        translate("Çalışma 1")
      );
      setTabs([resetTab]);
      setActiveTabId(resetTab.id);
      return;
    }

    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      const nextActiveIndex = Math.max(0, tabIndex - 1);
      setActiveTabId(newTabs[nextActiveIndex].id);
    }
  };

  const isUsingOpenRouter = config.activeProvider === 'openrouter';
  const isUsingGemini = config.activeProvider === 'gemini';
  const isUsingDeepSeek = config.activeProvider === 'deepseek';
  const isUsingOpenAI = config.activeProvider === 'openai';
  const hasValidOpenRouterKey = Boolean(config.openrouterApiKey.trim());
  const hasValidGeminiKey = Boolean(config.geminiApiKey.trim());
  const hasValidDeepSeekKey = Boolean(config.deepseekApiKey.trim());
  const hasValidOpenAIKey = Boolean(config.openaiApiKey.trim());

  return (
    <>
      <div
        id="katmandu-screen-root"
        className="h-screen h-[100dvh] max-h-screen overflow-hidden bg-[#f5f1e8] dark:bg-canvas text-stone-900 dark:text-stone-100 flex flex-col font-serif antialiased transition-colors duration-200 print:hidden"
      >
      {/* İnce ve Sessiz Üst Bar (HD-001, HD-002) */}
      <header className="spectrum-header relative h-12 border-b border-[#e5ded0] dark:border-stone-800 bg-[#faf6ee]/95 dark:bg-canvas backdrop-blur-xs px-6 flex items-center justify-between select-none shrink-0 sticky top-0 z-30 transition-colors">
        {/* Sol Bölüm: Kütüphane Butonu */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => compactLayout ? setMobileView(view => view === 'library' ? 'solution' : 'library') : setIsLibraryOpen(prev => !prev)}
            aria-label={translate("Kütüphanem")}
            aria-expanded={compactLayout ? mobileView === 'library' : isLibraryOpen}
            className={`spectrum-library-toggle inline-flex items-center gap-1.5 px-2 py-1 text-xs font-sans font-medium rounded border transition-colors shadow-2xs cursor-pointer ${
              (compactLayout ? mobileView === 'library' : isLibraryOpen)
                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold'
                : 'bg-[#f4efe4] dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-[#ede5d4] dark:hover:bg-stone-700 border-[#dcceb8] dark:border-stone-700'
            }`}
            title={(compactLayout ? mobileView === 'library' : isLibraryOpen) ? translate("Kütüphaneyi Gizle") : translate("Kütüphaneyi ve Çözüm Geçmişini Aç")}
          >
            <Library className="w-3.5 h-3.5 text-amber-800 dark:text-amber-500" />
            <span className="hidden sm:inline">{translate("Kütüphanem")}</span>
            {libraryItems.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 font-semibold ml-0.5">
                {libraryItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Orta Bölüm: Yazılımın Adı (KATMANDU) */}
        <div className="spectrum-brand absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none sm:pointer-events-auto">
          <GraduationCap className="w-5 h-5 text-amber-900 dark:text-amber-500" />
          <span className="font-serif font-bold tracking-wider text-stone-900 dark:text-stone-100 text-sm sm:text-base">
            KATMANDU
          </span>
          <span className="text-[11px] font-sans text-stone-400 dark:text-stone-500 font-normal hidden 2xl:inline">
            {translate("v2.0 • Bilimsel Çözüm ve Derinleşme")}</span>
        </div>

        {/* Sağ Bölüm: Aktif Model, Dönen Oklar, Tema Seçimi, Ayarlar, Dışa Aktar */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* 1. Aktif Model Rozeti (Tıklanabilir ve Ayarları Açar) */}
          {isUsingOpenRouter ? (
            <div
              onClick={() => setIsSettingsOpen(true)}
              title={translate("Model veya akıl yürütme seviyesini değiştirmek için tıklayın")}
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium border cursor-pointer hover:opacity-90 transition-all ${
                hasValidOpenRouterKey
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${hasValidOpenRouterKey ? 'bg-emerald-600' : 'bg-amber-500 animate-pulse'}`} />
              <span>
                OpenRouter: {config.openrouterModel.split('/').pop() || config.openrouterModel} ({config.openrouterReasoningEffort || 'low'})
              </span>
              {!hasValidOpenRouterKey && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 underline">
                  {translate("(Anahtar Girin)")}</span>
              )}
            </div>
          ) : isUsingGemini ? (
            <div
              onClick={() => setIsSettingsOpen(true)}
              title={translate("Model veya sağlayıcıyı değiştirmek için tıklayın")}
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium border cursor-pointer hover:opacity-90 transition-all ${
                hasValidGeminiKey
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${hasValidGeminiKey ? 'bg-emerald-600' : 'bg-amber-500 animate-pulse'}`} />
              <span>
                Google {config.geminiModel} ({config.geminiThinkingLevel || 'medium'})
              </span>
              {!hasValidGeminiKey && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 underline">
                  {translate("(Ücretsiz Anahtar Girin)")}</span>
              )}
            </div>
          ) : isUsingDeepSeek ? (
            <div
              onClick={() => setIsSettingsOpen(true)}
              title={translate("Model veya sağlayıcıyı değiştirmek için tıklayın")}
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium border cursor-pointer hover:opacity-90 transition-all ${
                hasValidDeepSeekKey
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${hasValidDeepSeekKey ? 'bg-emerald-600' : 'bg-amber-500 animate-pulse'}`} />
              <span>
                DeepSeek {config.deepseekModel}
              </span>
              {!hasValidDeepSeekKey && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 underline">
                  {translate("(Anahtar Girin)")}</span>
              )}
            </div>
          ) : isUsingOpenAI ? (
            <div
              onClick={() => setIsSettingsOpen(true)}
              title={translate("Model veya sağlayıcıyı değiştirmek için tıklayın")}
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium border cursor-pointer hover:opacity-90 transition-all ${
                hasValidOpenAIKey
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${hasValidOpenAIKey ? 'bg-emerald-600' : 'bg-amber-500 animate-pulse'}`} />
              <span>
                {config.openaiModel} ({config.openaiReasoningEffort})
              </span>
              {!hasValidOpenAIKey && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 underline">
                  {translate("(Anahtar Girin)")}</span>
              )}
            </div>
          ) : (
            <div
              onClick={() => setIsSettingsOpen(true)}
              title={translate("Sağlayıcı veya modeli değiştirmek için tıklayın")}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 cursor-pointer hover:opacity-90 transition-all"
            >
              <div className="w-2 h-2 rounded-full bg-stone-400 dark:bg-stone-500" />
              <span>{translate("Kanonik Mock (Çevrimdışı)")}</span>
            </div>
          )}

          {/* 2. Dönen Oklar Animasyonu (İşlemin yapıldığını gösteren dönen oklar hemen yanında) */}
          <button
            type="button"
            onClick={() => loadSolution(currentProblem)}
            disabled={isLoading}
            className={`p-1.5 rounded transition-colors ${
              isLoading
                ? 'text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-950/50'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
            title={isLoading ? translate("İşlem yapılıyor (çözüm üretiliyor)...") : translate("Mevcut çözümü yeniden yükle")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-600 dark:text-amber-400' : ''}`} />
          </button>

          {isLoading && <button type="button" onClick={handleStopOperation}
            className="px-2 py-1 text-xs text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 rounded">{translate("Durdur")}</button>}
          {/* 3. Koyu / Açık Mod Seçimi */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            title={theme === 'dark' ? translate("Açık Moda Geç") : translate("Koyu Moda Geç (Göz Dostu)")}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-stone-600" />}
          </button>

          {/* 4. Ayarlar */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            title={translate("Model ve API Ayarları")}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* 5. Dışa Aktar */}
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            disabled={!tabs.some((t) => Boolean(t.document))}
            className="spectrum-export inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium text-stone-700 dark:text-stone-200 bg-[#f4efe4] dark:bg-stone-800 hover:bg-[#eae2d0] dark:hover:bg-stone-700 border border-[#dcceb8] dark:border-stone-700 rounded transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title={
              tabs.some((t) => Boolean(t.document))
                ? translate("Çözümü veya seçili soruları PDF / LaTeX olarak dışa aktar")
                : translate("Dışa aktarmak için önce en az bir çözüm yükleyiniz")
            }
          >
            <Upload className="w-3.5 h-3.5 text-amber-900 dark:text-amber-500" />
            <span className="hidden sm:inline">{translate("Dışa Aktar")}</span>
          </button>
        </div>
      </header>

      {(providerSession.error || providerSession.isDemo) && (
        <div role="status" className="provider-status bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 px-6 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-center justify-between gap-4">
          <span>{providerSession.error || translate("Çevrimdışı Demo: Hazır örnek çözümler gösterilir; girdiğiniz soru yapay zekâ ile çözülmez.")}</span>
          <button type="button" onClick={() => setIsSettingsOpen(true)} className="underline shrink-0">
            {translate("Ayarları aç")}</button>
        </div>
      )}

      {/* Hata Bildirim Çubuğu */}
      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 px-6 py-2.5 text-xs text-red-900 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-700 dark:text-red-400 hover:text-red-950 dark:hover:text-red-200 font-medium ml-4 text-[11px] underline"
          >
            {translate("Kapat")}</button>
        </div>
      )}

      {compactLayout && <nav aria-label={translate("Çalışma alanı bölümleri")} className="mobile-workspace-nav flex shrink-0 border-b border-stone-300 dark:border-stone-800 bg-white dark:bg-canvas font-sans">
        {([
          ['solution', translate("Çözüm"), BookOpen],
          ['library', translate("Kütüphanem"), Library],
          ['tree', translate("Dallanma Ağacı"), GitFork]
        ] as const).map(([view, label, Icon]) => <button key={view} type="button" aria-pressed={mobileView === view}
          onClick={() => setMobileView(view)} className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-3 text-xs border-b-2 ${mobileView === view ? 'border-amber-500 text-amber-800 dark:text-amber-300' : 'border-transparent text-stone-500 dark:text-stone-400'}`}>
          <Icon className="w-4 h-4 shrink-0" />{label}
        </button>)}
      </nav>}

      {/* Ana Çözüm Alanı, Sol Kütüphane ve Sağ Dallanma Ağacı Paneli */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sol: Kütüphane / Çözüm Geçmişi Paneli */}
        <LibraryPanel
          isOpen={isLibraryOpen || compactLayout}
          hidden={compactLayout && mobileView !== 'library'}
          onClose={() => compactLayout ? setMobileView('solution') : setIsLibraryOpen(false)}
          items={libraryItems}
          storageMessage={archiveStatus.message}
          storageError={archiveStatus.state === 'error'}
          activeItemId={activeLibraryItemId}
          onSelectItem={async item => { await handleSelectLibraryItem(item); setMobileView('solution'); }}
          onDeleteItem={handleDeleteLibraryItem}
          onNewQuestion={() => setIsModalOpen(true)}
        />

        {/* Orta: Çözüm Alanı Kapsayıcısı */}
        <div data-workspace-panel="solution" hidden={compactLayout && mobileView !== 'solution'} className="workspace-solution flex-1 relative flex flex-col min-w-0 min-h-0 h-full overflow-hidden bg-[#f4efe4] dark:bg-canvas">
          {/* Çoklu Soru Sekme Çubuğu */}
          <ProblemTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={(id) => setActiveTabId(id)}
            onCloseTab={handleCloseTab}
            onNewTab={handleNewTab}
          />

          {/* Üst Başlık ve Yakınlaştırma Kontrolleri (Dallanma Ağacı Başlığı ile Birebir Uyumlu ve Sabit) */}
          {document && (
            <div className="p-4 pb-3 border-b border-[#e5ded0] dark:border-stone-800 bg-[#f7f2e7]/95 dark:bg-canvas backdrop-blur-md shrink-0 z-10 select-none sticky top-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 text-stone-800 dark:text-stone-200">
                  <BookOpen className="w-4 h-4 text-amber-800 dark:text-amber-500 shrink-0" />
                  <span className="text-xs uppercase tracking-wider font-semibold font-sans truncate">
                    {translate("Bilimsel Çözüm")}</span>
                  {openLayerIds.size > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800 shrink-0">
                      {openLayerIds.size} {translate("Yerinde Türetim Açık")}</span>
                  )}
                </div>

                {/* Kontroller: Zoom & Reset */}
                <div className="solution-zoom-controls flex items-center gap-1 bg-[#ede5d4] dark:bg-stone-800/90 rounded px-1 py-0.5 border border-[#dcceb8] dark:border-stone-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPaperZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
                    className="p-1 hover:bg-[#dfd4c0] dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 rounded transition-colors cursor-pointer"
                    title={translate("Uzaklaştır (%50 min)")}
                  >
                    <ZoomOut className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] font-mono px-1 text-stone-700 dark:text-stone-300 font-medium min-w-[34px] text-center">
                    %{Math.round(paperZoom * 100)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaperZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))}
                    className="p-1 hover:bg-[#dfd4c0] dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 rounded transition-colors cursor-pointer"
                    title={translate("Yakınlaştır (%200 max)")}
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperZoom(1)}
                    className="p-1 hover:bg-[#dfd4c0] dark:hover:bg-stone-700 text-stone-500 dark:text-stone-400 rounded transition-colors ml-0.5 cursor-pointer"
                    title={translate("Ölçeği Sıfırla (%100)")}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 text-[11px] text-stone-500 dark:text-stone-400 gap-3">
                <span className="font-serif italic truncate flex items-center gap-1 min-w-0">
                  <FileText className="w-3 h-3 text-amber-700 dark:text-amber-400 shrink-0" />
                  <span className="truncate" title={document.problemTitle}>
                    {document.problemTitle}
                  </span>
                </span>
                <span className="font-mono px-1.5 py-0.2 rounded bg-[#eae2d2] dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[10px] shrink-0">
                  {Object.keys(expansionCache).length > 0
                    ? translate("{0} Türetim Katmanı", [Object.keys(expansionCache).length])
                    : translate("A4 Doküman")}
                </span>
              </div>
            </div>
          )}

          {/* Orta: Beyaz / Koyu Kağıt Dokümanı */}
          <main
            ref={mainScrollRef}
            onWheel={handleSolutionWheel}
            className="solution-scroll flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-4 flex justify-center"
          >
            {isLoading && !document ? (
              <div className="flex flex-col items-center justify-center h-64 text-stone-500 dark:text-stone-400 font-serif italic text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mb-3 text-amber-800 dark:text-amber-500" />
                <span>
                  {isUsingGemini
                    ? translate("{0} ile bilimsel çözüm derleniyor...", [config.geminiModel])
                    : isUsingOpenAI
                    ? translate("{0} ile bilimsel çözüm derleniyor...", [config.openaiModel])
                    : translate("Bilimsel çözüm derleniyor...")}
                </span>
              </div>
            ) : document ? (
              <PaperLayout
                document={document}
                selectedEquation={selectedEquation}
                isExpanding={isLoading && Boolean(document)}
                expandingBlockId={expandingBlockId}
                layersByTargetId={layersByTargetId}
                openLayerIds={openLayerIds}
                onToggleLayer={handleToggleLayer}
                zoom={compactLayout ? 1 : paperZoom}
                onSelectEquation={handleSelectEquation}
                onContextualInquire={handleContextualInquire}
                onSolveAlternativePath={handleSolveAlternativePath}
                isSolvingPath={Boolean(solvingPathId)}
              />
            ) : (
              <div className="workspace-welcome max-w-xl w-full my-auto py-12 px-6 text-center animate-fade-in">
                <div className="spectrum-welcome-icon w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex items-center justify-center mx-auto mb-5 shadow-xs">
                  <GraduationCap className="w-8 h-8 text-amber-800 dark:text-amber-400" />
                </div>

                <h2 className="text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight mb-1.5">
                  KATMANDU
                </h2>
                <p className="spectrum-welcome-kicker text-xs uppercase tracking-widest font-sans font-semibold text-amber-800 dark:text-amber-400 mb-4">
                  {translate("Bilimsel Çözüm & Epistemik Derinleşme Motoru")}</p>

                <p className="text-stone-600 dark:text-stone-300 text-sm font-serif leading-relaxed mb-6">
                  {translate("Üniversite ve ileri araştırma düzeyinde fizik ve matematik problemlerini adım adım, analitik türetimlerle çözer. Çözümdeki her denkleme tıklayarak ara adımlara, FBD diyagramlarına ve en temeldeki kurucu doğa yasalarına veya Öklid aksiyomlarına kadar inebilirsiniz.")}</p>

                {/* Çok Modlu Problem Giriş Paneli (Metin/LaTeX, Görsel veya PDF) */}
                <div className="bg-white dark:bg-panel border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-xs text-left mb-4">
                  <ProblemInputTabs
                    onSubmit={handleSubmitNewProblem}
                    isLoading={isLoading}
                    compact={true}
                    submitButtonText={translate("Çözümü Başlat")}
                    activeProvider={config.activeProvider}
                  />
                </div>

                <div className="text-[11px] text-stone-400 dark:text-stone-500 font-serif italic">
                  {translate("Türetim dallanma ağacı, çözülen problemin denklemlerine tıklandıkça sağ panelde aşağı ve iki yana doğru açılarak görselleşecektir.")}</div>
              </div>
            )}
          </main>
        </div>

        {/* Sağ Panel: Türetim Dallanma Ağacı (2D Branching Tree Panel) */}
        <DerivationTreePanel
          hidden={compactLayout && mobileView !== 'tree'}
          tree={tree}
          activeNodeId={focusedNodeId}
          currentDepth={focusedNodeDepth}
          hasDocument={Boolean(document)}
          executionReport={document?.executionReport}
          onSelectNode={id => {
            setMobileView('solution');
            // The solution must be visible before scrolling to its selected node.
            requestAnimationFrame(() => handleSelectTreeNode(id));
          }}
        />
      </div>

      {/* Zihin Haritası Modali (Mind Map Canvas) */}
      <MindMapModal
        isOpen={isMindMapOpen}
        onClose={() => setIsMindMapOpen(false)}
        tree={tree}
        activeNodeId={focusedNodeId}
        onSelectNode={handleSelectTreeNode}
      />

      {/* Soru Giriş Modali */}
      <ProblemInputModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmitProblem={handleSubmitNewProblem}
        onSubmitMultipleProblems={handleSubmitMultipleProblems}
        isLoading={isLoading}
        hasExistingTabs={tabs.length > 0 && Boolean(activeTab.document)}
        activeProvider={config.activeProvider}
      />

      {/* Ayarlar Modali */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
      />

      {/* Dışa Aktarma (Export: PDF / LaTeX) Modalı */}
      {isExportModalOpen && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center text-white">{translate("Dışa aktarma hazırlanıyor…")}</div>}>
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          document={document}
          tree={tree}
          expansionCache={expansionCache}
          onPreparePrint={handlePreparePrint}
          tabs={tabs}
          activeTabId={activeTabId}
          onPrepareMultiPrint={handlePrepareMultiPrint}
        />
        </Suspense>
      )}
    </div>

    {/* Baskı / PDF İçin A4 Akademik Doküman (Ekranda hidden, baskıda block) */}
    {printableMultiItems && printableMultiItems.length > 0 ? (
      <PrintableReport documents={printableMultiItems} />
    ) : document ? (
      <PrintableReport
        document={document}
        layers={printableLayers}
        maxDepth={printableMaxDepth}
      />
    ) : null}
  </>
  );
}

export default App;
