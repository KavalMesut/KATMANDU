// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ConfigManager, DEFAULT_CONFIG } from '../domain/config';
import { LibraryStorage } from '../domain/libraryStorage';
import { UsageTracker } from '../domain/usageReport';
import type { ProblemInputTabs } from '../components/ProblemInputTabs';

declare const jsdom: { window: { localStorage: Storage } };

const service = vi.hoisted(() => ({ solve: vi.fn(), recommend: vi.fn(), detect: vi.fn() }));
let input!: ComponentProps<typeof ProblemInputTabs>;

vi.mock('../components/ProblemInputTabs', () => ({ ProblemInputTabs: (props: ComponentProps<typeof ProblemInputTabs>) => {
  input = props;
  return <div data-testid="problem-input" />;
} }));
vi.mock('../domain/modelRecommendation', async importOriginal => ({
  ...await importOriginal<typeof import('../domain/modelRecommendation')>(),
  recommendModel: service.recommend
}));
vi.mock('../providers/providerSession', () => {
  const createProviderSession = (config: typeof DEFAULT_CONFIG) => {
    const usageTracker = new UsageTracker();
    return {
      provider: {
        usageTracker,
        solve: async (problem: unknown) => {
          const result = await service.solve(config.activeProvider, config[`${config.activeProvider}Model` as keyof typeof config], problem);
          usageTracker.record({ usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } });
          return result;
        },
        detectQuestions: (...args: unknown[]) => service.detect(...args)
      },
      error: null,
      isDemo: false,
      fork: () => createProviderSession(config),
      createMetadata: () => ({ providerName: config.activeProvider, modelName: String(config[`${config.activeProvider}Model` as keyof typeof config]), reasoningEffort: 'medium', solvedAt: Date.now() })
    };
  };
  return { createProviderSession };
});

let host: HTMLDivElement;
let root: Root;

async function waitFor(check: () => void | Promise<void>) {
  for (let i = 0; i < 100; i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    try { await check(); return; } catch (error) { if (i === 99) throw error; }
  }
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'test-model' }] }) }));
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  await LibraryStorage.clearAll();
  ConfigManager.saveConfig({ ...DEFAULT_CONFIG, activeProvider: 'openai', openaiApiKey: 'key', geminiApiKey: 'key', modelSelectionMode: 'auto' });
  localStorage.setItem('katmandu_app_config_v2', JSON.stringify({ ...ConfigManager.getConfig(), modelSelectionMode: 'auto' }));
  service.solve.mockReset().mockResolvedValue({ problemTitle: 'Çözüm', strategy: '', sections: [{ title: 'Çözüm', blocks: [{ kind: 'equation', latex: 'x=1' }] }] });
  service.detect.mockReset().mockResolvedValue([]);
  service.recommend.mockReset().mockResolvedValue({
    choices: [
      { id: 'openai:gpt-5.6-terra', provider: 'openai', model: 'gpt-5.6-terra', label: 'OpenAI · gpt-5.6-terra' },
      { id: 'gemini:gemini-3.6-flash', provider: 'gemini', model: 'gemini-3.6-flash', label: 'Gemini · gemini-3.6-flash' }
    ],
    suggestedId: 'openai:gpt-5.6-terra', reason: 'Öneri', method: 'ai', routerLabel: 'OpenAI · gpt-6-sol (orta)',
    routerRun: { role: 'router', providerName: 'OpenAI', modelName: 'gpt-6-sol', reasoningEffort: 'medium',
      usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50, reportedCalls: 1, unreportedCalls: 0 } }
  });
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('manual model selection while automatic routing is disabled', () => {
  it('migrates a saved automatic preference and solves directly with the selected model without routing', async () => {
    expect(ConfigManager.getConfig().modelSelectionMode).toBe('manual');
    expect(host.textContent).not.toContain('Otomatik seçim');
    await act(async () => { await input.onSubmit({ text: 'x nedir?' }); });
    await waitFor(() => expect(service.solve).toHaveBeenCalledTimes(1));
    expect(service.recommend).not.toHaveBeenCalled();
    expect(service.detect).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(service.solve.mock.calls[0][0]).toBe('openai');
    expect(service.solve.mock.calls[0][1]).toBe('gpt-5.6-terra');
    await waitFor(async () => expect(await LibraryStorage.getAllItems()).toHaveLength(1));
    const saved = (await LibraryStorage.getAllItems())[0];
    expect(saved.document.executionReport?.runs).toMatchObject([
      { role: 'solution', modelName: 'gpt-5.6-terra', usage: { totalTokens: 200 } }
    ]);
    expect(saved.document.executionReport?.totalUsage.totalTokens).toBe(200);
  });

  it('still detects multiple questions automatically and solves each with the manually selected model', async () => {
    service.detect.mockResolvedValueOnce([
      { questionNumber: 1, title: 'Question 1', instruction: 'Find x.' },
      { questionNumber: 2, title: 'Question 2', instruction: 'Find y.' }
    ]);
    await act(async () => { await input.onSubmit({ text: 'A document with two independent questions.' }); });
    await waitFor(async () => expect(await LibraryStorage.getAllItems()).toHaveLength(2));
    expect(service.recommend).not.toHaveBeenCalled();
    expect(service.solve).toHaveBeenCalledTimes(2);
    for (const call of service.solve.mock.calls) expect(call.slice(0, 2)).toEqual(['openai', 'gpt-5.6-terra']);
    for (const item of await LibraryStorage.getAllItems()) {
      expect(item.document.executionReport?.runs).toMatchObject([{ role: 'solution', usage: { totalTokens: 200 } }]);
      expect(item.document.executionReport?.runs.some(run => run.role === 'router')).toBe(false);
    }
  });
});
