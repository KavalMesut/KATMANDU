import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfig, DEFAULT_CONFIG } from '../domain/config';
import { createProviderSession, createSessionForSavedSolution } from '../providers/providerSession';
import { MockProvider } from '../providers/mockProvider';
import { OpenAIProvider } from '../providers/openaiProvider';
import { GeminiProvider } from '../providers/geminiProvider';
import { OpenRouterProvider } from '../providers/openRouterProvider';
import { DeepSeekProvider } from '../providers/deepseekProvider';

const cases = [
  ['openrouter', 'openrouterApiKey', 'openrouterModel', 'OpenRouter', OpenRouterProvider],
  ['openai', 'openaiApiKey', 'openaiModel', 'OpenAI', OpenAIProvider],
  ['gemini', 'geminiApiKey', 'geminiModel', 'Google Gemini', GeminiProvider],
  ['deepseek', 'deepseekApiKey', 'deepseekModel', 'DeepSeek', DeepSeekProvider]
] as const;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Provider session selection and provenance', () => {
  for (const [activeProvider, key, model, name, Constructor] of cases) {
    it.each(['', '   ', undefined])(`${activeProvider}: missing key %s never selects demo or calls the network`, value => {
      const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
      const solve = vi.spyOn(MockProvider.prototype, 'solve');
      const session = createProviderSession({ ...DEFAULT_CONFIG, activeProvider, [key]: value });
      expect(session.provider).toBeNull();
      expect(session.isDemo).toBe(false);
      expect(session.error).toContain(`${name} API anahtarı eksik`);
      expect(() => session.createMetadata()).toThrow('API anahtarı eksik');
      expect(fetch).not.toHaveBeenCalled();
      expect(solve).not.toHaveBeenCalled();
    });

    it(`${activeProvider}: retains the request source when configuration changes while solving`, async () => {
      let finish!: () => void;
      vi.spyOn(Constructor.prototype, 'solve').mockImplementation(() => new Promise(resolve => {
        finish = () => resolve({ problemTitle: 'Result', strategy: '', sections: [] });
      }));
      const config: AppConfig = { ...DEFAULT_CONFIG, activeProvider, [key]: 'test-key', [model]: 'original-model' };
      const session = createProviderSession(config);
      expect(session.provider).toBeInstanceOf(Constructor);
      expect(session.error).toBeNull();
      const pending = session.provider!.solve({ id: 'p', text: 'Question', createdAt: 0 });
      config.activeProvider = 'mock';
      config[model] = 'changed-model';
      finish(); await pending;
      expect(session.createMetadata()).toMatchObject({ providerName: name, modelName: 'original-model', solvedAt: expect.any(Number) });
    });
  }

  it('only explicit demo selection returns fixtures with demo provenance', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const session = createProviderSession({ ...DEFAULT_CONFIG, activeProvider: 'mock' });
    expect(session.provider).toBeInstanceOf(MockProvider);
    expect(session.isDemo).toBe(true);
    const result = await session.provider!.solve({ id: 'p', text: 'Basit sarkaç', createdAt: 0 });
    expect(result.sections.length).toBeGreaterThan(0);
    expect(session.createMetadata()).toMatchObject({ providerName: 'KATMANDU Çevrimdışı Demo', modelName: 'Hazır kanonik örnekler' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported saved providers instead of falling back to demo', () => {
    const session = createProviderSession({ ...DEFAULT_CONFIG, activeProvider: 'unsupported' } as unknown as AppConfig);
    expect(session.provider).toBeNull();
    expect(session.isDemo).toBe(false);
    expect(session.error).toContain('desteklenmiyor');
  });

  it('reopens a saved solution with its recorded model for further work', () => {
    const session = createSessionForSavedSolution(
      { ...DEFAULT_CONFIG, activeProvider: 'gemini', openaiApiKey: 'key', openaiModel: 'new-model' },
      { providerName: 'OpenAI', modelName: 'saved-model', solvedAt: 1 }
    );
    expect(session?.provider).toBeInstanceOf(OpenAIProvider);
    expect(session?.createMetadata().modelName).toBe('saved-model');
  });
});
