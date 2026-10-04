import { afterEach, describe, expect, it, vi } from 'vitest';
import { TabRequestTracker } from '../domain/tabRequests';
import { RequestScheduler, abortableDelay } from '../domain/requestControl';
import { OpenAIProvider } from '../providers/openaiProvider';
import { DEFAULT_CONFIG } from '../domain/config';
import { ProviderTransport } from '../providers/providerTransport';
import { UsageTracker } from '../domain/usageReport';
import { fetchModelCatalog } from '../domain/modelCatalog';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('request cancellation and limits', () => {
  it('aborts replaced/closed tab requests and releases their timers', () => {
    const tracker = new TabRequestTracker(); const token = tracker.begin('a');
    const signal = tracker.signal('a', token);
    const replacement = tracker.begin('a'); expect(signal.aborted).toBe(true);
    const next = tracker.signal('a', replacement); tracker.cancel('a');
    expect(next.aborted).toBe(true); expect(tracker.isCurrent('a', replacement)).toBe(false);
  });
  it('times out an operation with an explicit reason', async () => {
    vi.useFakeTimers(); const tracker = new TabRequestTracker(); const token = tracker.begin('a', 100);
    const signal = tracker.signal('a', token); await vi.advanceTimersByTimeAsync(100);
    expect(signal.reason.name).toBe('TimeoutError'); tracker.clear();
  });
  it('cancels retry backoff immediately', async () => {
    const controller = new AbortController(); const waiting = abortableDelay(60000, controller.signal);
    controller.abort(new DOMException('stop', 'AbortError'));
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('limits concurrency and removes a cancelled queued job', async () => {
    const queue = new RequestScheduler(); queue.limit = 1;
    let release!: () => void; const first = queue.run(new AbortController().signal, () => new Promise<void>(r => { release = r; }));
    const controller = new AbortController(), task = vi.fn();
    const second = queue.run(controller.signal, task); controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); release(); await first; expect(task).not.toHaveBeenCalled();
    await queue.run(new AbortController().signal, async () => 1);
  });
  it('aborts a live provider fetch without retrying', async () => {
    const fetchMock = vi.fn((_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController(); const provider = new OpenAIProvider({ ...DEFAULT_CONFIG, openaiApiKey: 'key' }, 0);
    provider.setRequestSignal(controller.signal);
    const result = provider.solve({ id: 'p', text: 'solve', createdAt: 1 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce()); controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('blocks an unknown price before spending when a budget is enabled', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null }); const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const transport = new ProviderTransport({ ...DEFAULT_CONFIG, maxCostPerQuestionUsd: 1 }, 'openai', new UsageTracker());
    await expect(transport.fetch('https://example.invalid', { body: '{}' })).rejects.toMatchObject({ name: 'BudgetError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a priced request whose output reserve exceeds the remaining budget', async () => {
    const storage = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) });
    const config = { ...DEFAULT_CONFIG, openrouterApiKey: 'key', openrouterModel: 'test-priced', maxCostPerQuestionUsd: 0.1 };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'test-priced', pricing: { prompt: '0.00001', completion: '0.00002' } }] }) })));
    await fetchModelCatalog(config, 'openrouter'); const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const transport = new ProviderTransport(config, 'openrouter', new UsageTracker());
    await expect(transport.fetch('https://example.invalid', { body: JSON.stringify({ messages: [{ content: 'text' }], max_tokens: 12000 }) })).rejects.toMatchObject({ name: 'BudgetError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
