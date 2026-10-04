import { describe, expect, it, vi } from 'vitest';
import { addTokenUsage, EMPTY_USAGE, readTokenUsage, totalRunUsage, UsageTracker, withRunCost } from '../domain/usageReport';
import { DEFAULT_CONFIG } from '../domain/config';
import * as modelCatalog from '../domain/modelCatalog';

describe('API token raporu', () => {
  it('OpenAI Responses ve Chat Completions, OpenRouter ve DeepSeek sayılarını okur', () => {
    expect(readTokenUsage({ usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 } }).totalTokens).toBe(200);
    expect(readTokenUsage({ usage: { prompt_tokens: 130, completion_tokens: 90, total_tokens: 220 } })).toMatchObject({ inputTokens: 130, outputTokens: 90, totalTokens: 220 });
    expect(readTokenUsage({ usage: { promptTokens: 10, completionTokens: 5 } }).totalTokens).toBe(15);
  });

  it('Gemini düşünme tokenlarını içeren sağlayıcı toplamını kullanır', () => {
    expect(readTokenUsage({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 20, totalTokenCount: 170 } })).toMatchObject({
      inputTokens: 100, outputTokens: 50, totalTokens: 170
    });
  });

  it('eksik kullanım sayısını tahmin etmez ve toplamın eksik olduğunu korur', () => {
    const tracker = new UsageTracker();
    tracker.record({ usage: { prompt_tokens: 4, completion_tokens: 6 } });
    tracker.record({ choices: [{ message: { content: 'yanıt' } }] });
    expect(tracker.snapshot()).toMatchObject({ inputTokens: null, outputTokens: null, totalTokens: null, reportedCalls: 1, unreportedCalls: 1 });
    expect(totalRunUsage([{ role: 'router', providerName: 'OpenAI', modelName: 'gpt-6-sol', usage: readTokenUsage({ usage: { input_tokens: 3, output_tokens: 2 } }) },
      { role: 'solution', providerName: 'Gemini', modelName: 'gemini', usage: readTokenUsage({ usageMetadata: { totalTokenCount: 8 } }) }])).toMatchObject({ totalTokens: 13, inputTokens: null });
    expect(addTokenUsage(EMPTY_USAGE, tracker.snapshot())).toEqual(tracker.snapshot());
  });

  it('OpenRouter tarafından bildirilen çağrı ücretlerini toplar; eksik bildirimi ücret diye tahmin etmez', () => {
    const tracker = new UsageTracker();
    tracker.record({ usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0012 } });
    tracker.record({ usage: { prompt_tokens: 50, completion_tokens: 10, cost: 0.0004 } });
    expect(tracker.costSnapshot()).toBeCloseTo(0.0016);
    tracker.record({ usage: { prompt_tokens: 1, completion_tokens: 1 } });
    expect(tracker.costSnapshot()).toBeNull();
  });

  it('sağlayıcı ücreti yoksa yalnızca eksiksiz token ve katalog fiyatıyla tahmin yapar', () => {
    const spy = vi.spyOn(modelCatalog, 'readCachedModels').mockReturnValue([{
      id: 'test/model', name: 'Test', provider: 'openrouter', priceInputPerMillion: 2, priceOutputPerMillion: 6
    }]);
    const run = { role: 'solution' as const, providerName: 'OpenRouter', modelName: 'test/model',
      usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500, reportedCalls: 1, unreportedCalls: 0 } };
    expect(withRunCost(run, DEFAULT_CONFIG).cost).toEqual({ usd: 0.005, source: 'catalog' });
    expect(withRunCost(run, DEFAULT_CONFIG, 0.004).cost).toEqual({ usd: 0.004, source: 'provider' });
    expect(withRunCost({ ...run, usage: { ...run.usage, unreportedCalls: 1 } }, DEFAULT_CONFIG).cost).toBeUndefined();
    spy.mockRestore();
  });
});
