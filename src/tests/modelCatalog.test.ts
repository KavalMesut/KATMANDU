import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../domain/config';
import { fetchModelCatalog, refreshConfiguredModelCatalogs } from '../domain/modelCatalog';

let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value)
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('ModelCatalog', () => {
  it('açılışta anahtarı olan sağlayıcıların listelerini yeniler ve eşzamanlı istekleri birleştirir', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.includes('generativelanguage.googleapis.com')
        ? { models: [{ name: 'models/gemini-new', supportedGenerationMethods: ['generateContent'] }] }
        : { data: [{ id: 'provider/new-model' }] }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const config = {
      ...DEFAULT_CONFIG,
      openaiApiKey: 'openai-key', geminiApiKey: 'gemini-key',
      deepseekApiKey: 'deepseek-key', openrouterApiKey: 'router-key'
    };

    await Promise.all([refreshConfiguredModelCatalogs(config), refreshConfiguredModelCatalogs(config)]);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      'https://api.openai.com/v1/models',
      'https://api.deepseek.com/models',
      'https://openrouter.ai/api/v1/models'
    ]));
  });

  it('anahtar yoksa açılışta katalog ağına bağlanmaz', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await refreshConfiguredModelCatalogs(DEFAULT_CONFIG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('OpenAI hesabındaki yeni modeli otomatik keşfeder, seçimin kimliğini aynen korur ve önbelleğe alır', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'gpt-6-sol', owned_by: 'openai' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const config = { ...DEFAULT_CONFIG, openaiApiKey: 'test-key' };

    const models = await fetchModelCatalog(config, 'openai');

    expect(models).toMatchObject([{ id: 'gpt-6-sol', provider: 'openai' }]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/models');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
    expect(await fetchModelCatalog(config, 'openai')).toEqual(models);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('anahtar değiştiğinde önceki hesabın model listesini kullanmaz', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'account-a-model' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'account-b-model' }] }) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchModelCatalog({ ...DEFAULT_CONFIG, openaiApiKey: 'key-a' }, 'openai');
    const other = await fetchModelCatalog({ ...DEFAULT_CONFIG, openaiApiKey: 'key-b' }, 'openai');

    expect(other.map(model => model.id)).toEqual(['account-b-model']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('Gemini sayfalarını birleştirir ve içerik üretemeyen modelleri gizler', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: [
        { name: 'models/gemini-4-flash', displayName: 'Gemini 4 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }
      ], nextPageToken: 'next' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ models: [
        { name: 'models/gemini-4-pro', supportedGenerationMethods: ['generateContent'] }
      ] }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchModelCatalog({ ...DEFAULT_CONFIG, geminiApiKey: 'key' }, 'gemini');

    expect(result.map(model => model.id)).toEqual(['gemini-4-flash', 'gemini-4-pro']);
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('key');
    expect(fetchMock.mock.calls[1][0]).toContain('pageToken=next');
  });

  it('DeepSeek yeteneklerini taşır ve API hatasında son başarılı kataloğu gösterir', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [
      { id: 'deepseek-flash', name: 'DeepSeek Flash', input_modalities: ['text', 'image'], effort: { supported_levels: ['low', 'high'] } }
    ] }) }).mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const config = { ...DEFAULT_CONFIG, deepseekApiKey: 'key' };

    const first = await fetchModelCatalog(config, 'deepseek');
    const cached = await fetchModelCatalog(config, 'deepseek', true);

    expect(first[0]).toMatchObject({ id: 'deepseek-flash', inputModalities: ['text', 'image'], reasoningLevels: ['low', 'high'] });
    expect(cached).toEqual(first);
  });

  it('OpenRouter canlı model listesini ortak biçime dönüştürür', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      { id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', context_length: 1000000, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, supported_parameters: ['tools'], pricing: { prompt: '0.000003', completion: null } }
    ] }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchModelCatalog(DEFAULT_CONFIG, 'openrouter');

    expect(result[0]).toMatchObject({ id: 'openai/gpt-6-sol', contextWindow: 1000000, inputModalities: ['text', 'image'], outputModalities: ['text'], supportedParameters: ['tools'], priceInputPerMillion: 3 });
    expect(result[0].priceOutputPerMillion).toBeUndefined();
  });
});
