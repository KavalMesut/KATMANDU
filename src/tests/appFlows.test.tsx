// @vitest-environment jsdom
import { act, ComponentProps } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProblemTabBarProps } from '../components/ProblemTabBar';
import type { PaperLayout } from '../components/PaperLayout';
import type { LibraryPanel } from '../components/LibraryPanel';
import type { ProblemInputTabs } from '../components/ProblemInputTabs';
import type { DerivationTreePanel } from '../components/DerivationTreePanel';
import { RawExpansionResponse, RawSolutionResponse } from '../domain/types';
import { ConfigManager, DEFAULT_CONFIG } from '../domain/config';
import { LibraryStorage } from '../domain/libraryStorage';
import { App } from '../App';

declare const jsdom: { window: { localStorage: Storage } };

const service = vi.hoisted(() => ({ solve: vi.fn(), expand: vi.fn(), detectQuestions: vi.fn() }));
vi.mock('../providers/mockProvider', () => ({ MockProvider: class { solve = service.solve; expand = service.expand; detectQuestions = service.detectQuestions; } }));
vi.mock('../providers/deepseekProvider', () => ({ DeepSeekProvider: class {} }));

let tabs: ProblemTabBarProps;
let paper: ComponentProps<typeof PaperLayout>;
let library: ComponentProps<typeof LibraryPanel>;
let input: ComponentProps<typeof ProblemInputTabs>;
let treePanel: ComponentProps<typeof DerivationTreePanel>;
vi.mock('../components/ProblemTabBar', () => ({ ProblemTabBar: (props: ProblemTabBarProps) => {
  tabs = props;
  return <div data-testid="tabs">{props.tabs.map(t => t.document?.problemTitle || 'empty').join('|')}</div>;
} }));
vi.mock('../components/PaperLayout', () => ({ PaperLayout: (props: ComponentProps<typeof PaperLayout>) => {
  paper = props;
  return <div data-testid="paper">{props.document.problemTitle}</div>;
} }));
vi.mock('../components/LibraryPanel', () => ({ LibraryPanel: (props: ComponentProps<typeof LibraryPanel>) => { library = props; return null; } }));
vi.mock('../components/ProblemInputTabs', () => ({ ProblemInputTabs: (props: ComponentProps<typeof ProblemInputTabs>) => { input = props; return null; } }));
vi.mock('../components/DerivationTreePanel', () => ({ DerivationTreePanel: (props: ComponentProps<typeof DerivationTreePanel>) => { treePanel = props; return null; } }));
vi.mock('../components/PrintableReport', () => ({ PrintableReport: () => null }));

let root: Root;
let host: HTMLDivElement;
const solution = (title: string): RawSolutionResponse => ({ problemTitle: title, strategy: '', sections: [{ title: 'Çözüm', blocks: [{ kind: 'equation', latex: 'F=ma' }] }] });
const expansion = (): RawExpansionResponse => ({ title: 'Türetim', explanation: '', blocks: [{ kind: 'equation', latex: 'a=F/m' }] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
async function waitFor(check: () => void) {
  for (let i = 0; i < 100; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    try { check(); return; } catch (error) { if (i === 99) throw error; }
  }
}
async function mount() {
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(<App />); });
}
async function submit(text: string) {
  await act(async () => { input.onSubmit({ text }); });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  // Use jsdom storage rather than Node's experimental global localStorage.
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  await LibraryStorage.clearAll();
  ConfigManager.saveConfig({ ...DEFAULT_CONFIG, activeProvider: 'mock' });
  service.solve.mockReset(); service.expand.mockReset(); service.detectQuestions.mockReset();
  service.detectQuestions.mockResolvedValue([{ questionNumber: 1, title: 'Soru', instruction: 'Çöz.' }]);
  service.expand.mockResolvedValue(expansion());
  await mount();
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
});

describe('Mounted App request and persistence flows', () => {
  it('keeps the solution mounted across compact views and returns to it after selecting a saved item or tree node', async () => {
    await act(async () => root.unmount()); host.remove();
    let change!: () => void;
    const media = { matches: true, addEventListener: vi.fn((_event, listener) => { change = listener; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
    await mount();
    service.solve.mockResolvedValue(solution('Mobile solution'));
    await submit('Question');
    await waitFor(() => expect(paper.document.problemTitle).toBe('Mobile solution'));
    await waitFor(() => expect(library.items).toHaveLength(1));
    const panel = host.querySelector<HTMLElement>('[data-workspace-panel="solution"]')!;
    const originalDocument = paper.document;
    const clickView = async (label: string) => {
      const button = Array.from(host.querySelectorAll<HTMLButtonElement>('nav button')).find(b => b.textContent === label)!;
      await act(async () => button.click());
    };
    await clickView('Kütüphanem');
    expect(panel.hidden).toBe(true);
    expect(library.hidden).toBe(false);
    expect(paper.document).toBe(originalDocument);
    await act(async () => library.onSelectItem(library.items[0]));
    expect(panel.hidden).toBe(false);
    await clickView('Dallanma Ağacı');
    expect(treePanel.hidden).toBe(false);
    expect(panel.hidden).toBe(true);
    await act(async () => treePanel.onSelectNode('root'));
    expect(panel.hidden).toBe(false);
    expect(service.solve).toHaveBeenCalledTimes(1);
    await act(async () => { media.matches = false; change(); });
    expect(host.querySelector('nav')).toBeNull();
    expect(library.hidden).toBe(false);
    expect(treePanel.hidden).toBe(false);
    expect(paper.document.problemTitle).toBe('Mobile solution');
  });
  for (const activeProvider of ['openai', 'gemini', 'deepseek', 'openrouter'] as const) {
    it(`${activeProvider}: missing credentials block submission and refresh without saving a demo`, async () => {
      await act(async () => root.unmount());
      host.remove();
      ConfigManager.saveConfig({ ...DEFAULT_CONFIG, activeProvider, modelSelectionMode: 'manual' });
      const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
      await mount();
      expect(host.textContent).toContain('API anahtarı eksik');
      expect(host.textContent).not.toContain('Çevrimdışı Demo: Hazır');
      await submit('Yeni soru');
      const refresh = Array.from(host.querySelectorAll('button')).find(button => button.querySelector('.lucide-refresh-cw'))!;
      expect(refresh).toBeTruthy();
      await act(async () => refresh.click());
      expect(service.solve).not.toHaveBeenCalled();
      expect(service.detectQuestions).not.toHaveBeenCalled();
      expect(fetch.mock.calls.every(([input]) => String(input).startsWith('/api/library'))).toBe(true);
      expect(await LibraryStorage.getAllItems()).toHaveLength(0);
      const settings = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Ayarları aç')!;
      await act(async () => settings.click());
      expect(host.querySelector('input[type="password"]')).not.toBeNull();
    });
  }

  it('blocks new expansions without credentials while preserving saved source metadata', async () => {
    service.solve.mockResolvedValue(solution('Saved demo'));
    await submit('Sarkaç');
    await waitFor(() => expect(tabs.tabs[0].document).not.toBeNull());
    const original = (await LibraryStorage.getAllItems())[0];
    await act(async () => root.unmount()); host.remove();
    ConfigManager.saveConfig({ ...DEFAULT_CONFIG, activeProvider: 'gemini' });
    await mount();
    await waitFor(() => expect(library.items).toHaveLength(1));
    await act(async () => library.onSelectItem(library.items[0]));
    const eq = paper.document.sections[0].blocks[0];
    if (eq.kind !== 'equation') throw new Error('fixture');
    await act(async () => { await paper.onSelectEquation(eq); });
    await act(async () => { await paper.onContextualInquire('F=ma', 'Neden?', { blockId: eq.id }); });
    service.solve.mockClear();
    await act(async () => { paper.onSolveAlternativePath!({ id: 'path_2', methodName: 'Newton', description: '', query: 'Newton' }); });
    expect(service.solve).not.toHaveBeenCalled();
    expect(service.expand).not.toHaveBeenCalled();
    expect(tabs.tabs[0].errorMessage).toContain('Google Gemini API anahtarı eksik');
    expect((await LibraryStorage.getAllItems())[0].metadata).toEqual(original.metadata);
  });

  it('labels explicitly selected demo and persists its actual source', async () => {
    expect(host.textContent).toContain('Çevrimdışı Demo: Hazır örnek');
    service.solve.mockResolvedValue(solution('Demo'));
    await submit('Sarkaç');
    await waitFor(() => expect(paper.document.problemTitle).toBe('Demo'));
    const items = await LibraryStorage.getAllItems();
    expect(items[0].metadata?.providerName).toBe('KATMANDU Çevrimdışı Demo');
  });

  it('persists an alternative path with nested expansions and restores the parallel tree', async () => {
    service.solve.mockResolvedValueOnce({ ...solution('Main solution'), recommendedPaths: [
      { methodName: 'Newton', badge: '2. Yol', description: 'Newton yaklaşımı', query: 'Newton ile çöz' }
    ] });
    await submit('Lagrange ile sarkaç');
    await waitFor(() => expect(paper.document.recommendedPaths).toHaveLength(1));
    const path = paper.document.recommendedPaths![0];
    service.solve.mockResolvedValueOnce(solution('Alternative'));
    await act(async () => { paper.onSolveAlternativePath!(path); });
    await waitFor(() => expect(tabs.tabs[0].isLoading).toBe(false));
    const eq = paper.document.sections.find(s => s.id === `sec_${path.id}`)!.blocks[0];
    if (eq.kind !== 'equation') throw new Error('fixture');
    await act(async () => { await paper.onSelectEquation(eq); });
    await waitFor(() => expect(tabs.tabs[0].isLoading).toBe(false));
    expect(tabs.tabs[0].tree.parallelPaths?.[0].children).toHaveLength(1);
    const saved = (await LibraryStorage.getAllItems())[0];
    expect(saved.document.recommendedPaths?.[0].solved).toBe(true);
    await act(async () => root.unmount()); host.remove();
    await mount();
    await waitFor(() => expect(library.items).toHaveLength(1));
    await act(async () => library.onSelectItem(library.items[0]));
    expect(tabs.tabs[0].tree.parallelPaths?.[0].children).toHaveLength(1);
    await act(async () => { await paper.onSelectEquation(eq); });
    expect(service.expand).toHaveBeenCalledTimes(1);
    expect(service.expand.mock.calls[0][0].solutionContext).toContain('Ana Çözüm Akışı');
  });

  it('ignores an alternative solution after its tab closes', async () => {
    service.solve.mockResolvedValueOnce({ ...solution('Primary'), recommendedPaths: [
      { methodName: 'Newton', description: 'Newton yaklaşımı', query: 'Newton ile çöz' }
    ] });
    await submit('Sarkaç');
    await waitFor(() => expect(paper.document.recommendedPaths).toHaveLength(1));
    const pending = deferred<RawSolutionResponse>(); service.solve.mockReturnValueOnce(pending.promise);
    const tabId = tabs.activeTabId;
    await act(async () => { paper.onSolveAlternativePath!(paper.document.recommendedPaths![0]); });
    await act(async () => { tabs.onNewTab(); tabs.onCloseTab(tabId); });
    await act(async () => pending.resolve(solution('Late alternative')));
    expect((await LibraryStorage.getAllItems())[0].document.sections.some(s => s.id.startsWith('sec_path_'))).toBe(false);
    expect(tabs.tabs.some(t => t.id === tabId)).toBe(false);
  });

  it('keeps concurrent answers in their original tabs when completed out of order', async () => {
    const a = deferred<RawSolutionResponse>(), b = deferred<RawSolutionResponse>();
    service.solve.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    await submit('A');
    const firstId = tabs.activeTabId;
    await act(async () => { tabs.onNewTab(); });
    const secondId = tabs.activeTabId;
    await submit('B');
    await act(async () => { b.resolve(solution('B yanıtı')); });
    await waitFor(() => expect(host.querySelector('[data-testid="paper"]')?.textContent).toBe('B yanıtı'));
    await act(async () => { a.resolve(solution('A yanıtı')); });
    await waitFor(() => expect(tabs.tabs.find(t => t.id === firstId)?.document?.problemTitle).toBe('A yanıtı'));
    expect(tabs.activeTabId).toBe(secondId);
    expect(host.querySelector('[data-testid="paper"]')?.textContent).toBe('B yanıtı');
  });

  it('stops the active operation and ignores its eventual reply', async () => {
    const pending = deferred<RawSolutionResponse>(); service.solve.mockReturnValue(pending.promise);
    await submit('Uzun çözüm');
    const stop = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Durdur');
    expect(stop).toBeDefined();
    await act(async () => { stop!.click(); });
    expect(tabs.tabs[0].isLoading).toBe(false);
    await act(async () => { pending.resolve(solution('Durdurulan yanıt')); });
    expect(tabs.tabs[0].document).toBeNull();
    await act(async () => { expect(await LibraryStorage.getAllItems()).toEqual([]); });
  });

  it('ignores a late answer after closing its tab, including library writes', async () => {
    const a = deferred<RawSolutionResponse>(); service.solve.mockReturnValue(a.promise);
    await submit('A'); const oldId = tabs.activeTabId;
    await act(async () => { tabs.onNewTab(); });
    await act(async () => { tabs.onCloseTab(oldId); });
    await act(async () => { a.resolve(solution('Kapalı yanıt')); });
    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.tabs[0].document).toBeNull();
    expect(await LibraryStorage.getAllItems()).toEqual([]);
  });

  it('reloads stored equation and contextual expansions without another provider request', async () => {
    service.solve.mockResolvedValue(solution('Kalıcı çözüm'));
    await submit('Kuvvet');
    await waitFor(() => expect(tabs.tabs[0].document).not.toBeNull());
    const eq = paper.document.sections[0].blocks[0];
    if (eq.kind !== 'equation') throw new Error('fixture');
    await act(async () => { await paper.onSelectEquation(eq); });
    await waitFor(() => expect(tabs.tabs[0].isLoading).toBe(false));
    // An explicit root block must win even when an expanded block contains the selected text.
    await act(async () => { await paper.onContextualInquire('a=F/m', 'Neden?', { blockId: eq.id }); });
    await waitFor(() => expect(tabs.tabs[0].isLoading).toBe(false));
    expect(service.expand).toHaveBeenCalledTimes(2);
    expect(library.items[0].layerCount).toBe(2);
    await act(async () => { root.unmount(); }); host.remove();
    await mount();
    await waitFor(() => expect(library.items).toHaveLength(1));
    await act(async () => { library.onSelectItem(library.items[0]); });
    await act(async () => { await paper.onSelectEquation(eq); });
    await act(async () => { await paper.onContextualInquire('a=F/m', 'Neden?', { blockId: eq.id }); });
    expect(service.expand).toHaveBeenCalledTimes(2);
    expect(tabs.tabs[0].tree.children).toHaveLength(2);
  });

  it('does not start solving after PDF detection fails', async () => {
    service.detectQuestions.mockRejectedValue(new Error('PDF okunamadı'));
    await act(async () => { input.onSubmit({ text: '', attachments: [{ id: 'bad', name: 'bad.pdf', type: 'pdf', mimeType: 'application/pdf', data: 'bad' }] }); });
    expect(service.solve).not.toHaveBeenCalled();
    expect(tabs.tabs[0].errorMessage).toBe('PDF okunamadı');
  });

  it('does not create tabs or solve after closing a tab during question detection', async () => {
    const detection = deferred<Array<{ questionNumber: number; title: string; instruction: string }>>();
    service.detectQuestions.mockReturnValue(detection.promise);
    await submit('Soruları ayır'); const closedId = tabs.activeTabId;
    await act(async () => { tabs.onNewTab(); });
    await act(async () => { tabs.onCloseTab(closedId); });
    await act(async () => { detection.resolve([
      { questionNumber: 1, title: 'Bir', instruction: 'Birinci soru' },
      { questionNumber: 2, title: 'İki', instruction: 'İkinci soru' }
    ]); });
    expect(service.solve).not.toHaveBeenCalled();
    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.tabs[0].isLoading).toBe(false);
  });

  it('keeps expansion progress and completion isolated after switching tabs', async () => {
    service.solve.mockResolvedValue(solution('Ana çözüm'));
    await submit('Kuvvet');
    await waitFor(() => expect(tabs.tabs[0].document).not.toBeNull());
    const firstId = tabs.activeTabId;
    const eq = paper.document.sections[0].blocks[0];
    if (eq.kind !== 'equation') throw new Error('fixture');
    const pending = deferred<RawExpansionResponse>(); service.expand.mockReturnValue(pending.promise);
    await act(async () => { paper.onSelectEquation(eq); });
    await act(async () => { tabs.onNewTab(); });
    const secondId = tabs.activeTabId;
    expect(tabs.tabs.find(t => t.id === secondId)?.expandingBlockId).toBeUndefined();
    await act(async () => { pending.resolve(expansion()); });
    await waitFor(() => expect(tabs.tabs.find(t => t.id === firstId)?.isLoading).toBe(false));
    expect(tabs.tabs.find(t => t.id === firstId)?.tree.children).toHaveLength(1);
    expect(tabs.tabs.find(t => t.id === secondId)?.tree.children).toHaveLength(0);
  });
});
