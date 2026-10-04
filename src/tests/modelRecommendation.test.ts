import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../domain/config';
import { fetchModelCatalog } from '../domain/modelCatalog';
import { availableModelChoices, configForModelChoice, recommendModel } from '../domain/modelRecommendation';
import type { ProblemInput } from '../domain/types';

const problem: ProblemInput = { id: 'p1', text: 'Bir sarkaç problemini çöz.', createdAt: 1 };
let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value)
  });
});
afterEach(() => vi.unstubAllGlobals());

function analysis(fits: Array<{ id: string; fit: string }>, errorCost = 'medium', confidence = 'high') {
  return { difficulty: 'medium', errorCost, reasoning: 'medium', estimatedOutputTokens: 2000, confidence, fits, reason: 'Görev değerlendirildi.' };
}

describe('otomatik model önerisi', () => {
  it('GPT-6 Sol orta ile uygun adayları analiz eder ve yeterli adaylar arasında ucuz olanı seçer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ usage: { input_tokens: 40, output_tokens: 15, total_tokens: 55 }, output_text: JSON.stringify(analysis([
      { id: 'openai:gpt-5.6-terra', fit: 'strong' },
      { id: 'gemini:gemini-3.6-flash', fit: 'adequate' }
    ])) }) });
    vi.stubGlobal('fetch', fetchMock);
    const config = { ...DEFAULT_CONFIG, openaiApiKey: 'openai-key', geminiApiKey: 'gemini-key' };
    const result = await recommendModel(config, problem);
    expect(result.suggestedId).toBe('openai:gpt-5.6-terra'); // Without prices, the configured choice stays first.
    expect(result.method).toBe('ai');
    expect(result.routerRun).toMatchObject({ modelName: 'gpt-6-sol', reasoningEffort: 'medium', usage: { totalTokens: 55 } });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe('gpt-6-sol');
    expect(request.reasoning.effort).toBe('medium');
    expect(request.input[0].content[0].text).toContain('benchmarkSuccessRate');
  });

  it('katalog fiyatını ve bağlamı kullanır; düşük riskte en ucuz yeterli modeli seçer', async () => {
    const config = { ...DEFAULT_CONFIG, openaiApiKey: 'key', openrouterApiKey: 'key' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [
      { id: 'cheap', context_length: 20000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'expensive', context_length: 20000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000005', completion: '0.000010' } },
      { id: 'too-small', context_length: 100, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.0000001', completion: '0.0000001' } }
    ] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output_text: JSON.stringify(analysis([
      { id: 'openrouter:cheap', fit: 'adequate' }, { id: 'openrouter:expensive', fit: 'strong' }
    ])) }) }));
    await fetchModelCatalog(config, 'openrouter');
    const result = await recommendModel(config, problem);
    expect(result.choices.map(choice => choice.model)).not.toContain('too-small');
    expect(result.suggestedId).toBe('openrouter:cheap');
    expect(result.choices.find(choice => choice.model === 'cheap')?.estimatedCost).toBeGreaterThan(0);
  });

  it('yüksek hata maliyetinde ucuz ama yalnızca yeterli model yerine güçlü adayı seçer', async () => {
    const config = { ...DEFAULT_CONFIG, openaiApiKey: 'key', openrouterApiKey: 'key' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [
      { id: 'cheap', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000002' } },
      { id: 'strong', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000005', completion: '0.000010' } }
    ] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output_text: JSON.stringify(analysis([
      { id: 'openrouter:cheap', fit: 'adequate' }, { id: 'openrouter:strong', fit: 'strong' }
    ], 'high')) }) }));
    await fetchModelCatalog(config, 'openrouter');
    expect((await recommendModel(config, problem)).suggestedId).toBe('openrouter:strong');
  });

  it('yüksek riskte güçlü aday yoksa otomatik çözümü durdurur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output_text: JSON.stringify(analysis([
      { id: 'openai:gpt-5.6-terra', fit: 'adequate' }
    ], 'high')) }) }));
    await expect(recommendModel({ ...DEFAULT_CONFIG, openaiApiKey: 'key' }, problem)).rejects.toThrow('güvenilir güçlü');
  });

  it('çıktı tahmini bağlam sınırını aşarsa güçlü denilen modeli de eler', async () => {
    const config = { ...DEFAULT_CONFIG, openaiApiKey: 'key', openrouterApiKey: 'key' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [
      { id: 'short', context_length: 5000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000001' } },
      { id: 'long', context_length: 50000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000002', completion: '0.000002' } }
    ] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ output_text: JSON.stringify({
      ...analysis([{ id: 'openrouter:short', fit: 'strong' }, { id: 'openrouter:long', fit: 'strong' }]),
      estimatedOutputTokens: 8000
    }) }) }));
    await fetchModelCatalog(config, 'openrouter');
    expect((await recommendModel(config, problem)).suggestedId).toBe('openrouter:long');
  });

  it('görselde yeteneği bilinmeyenleri ve metin modellerini eler; doğrulanmış görsel modelini bırakır', async () => {
    const config = { ...DEFAULT_CONFIG, deepseekApiKey: 'key', geminiApiKey: 'key', openrouterApiKey: 'key', openaiApiKey: '' };
    const imageProblem: ProblemInput = { ...problem, attachments: [{ id: 'a', name: 'soru.png', type: 'image', mimeType: 'image/png', data: 'abc' }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      { id: 'text-only', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000001' } },
      { id: 'vision', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, pricing: { prompt: '0.000002', completion: '0.000002' } }
    ] }) }));
    await fetchModelCatalog(config, 'openrouter');
    expect(availableModelChoices(config, imageProblem).map(choice => choice.id)).toEqual(['gemini:gemini-3.6-flash', 'openrouter:vision']);
    expect((await recommendModel(config, imageProblem)).suggestedId).toBe('gemini:gemini-3.6-flash');
  });

  it('görsel desteği doğrulanmamışsa çözüm öncesinde durur; ağ çağrısı yapmaz', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const imageProblem: ProblemInput = { ...problem, attachments: [{ id: 'a', name: 'soru.png', type: 'image', mimeType: 'image/png', data: 'abc' }] };
    await expect(recommendModel({ ...DEFAULT_CONFIG, geminiApiKey: 'key', geminiModel: 'unknown-gemini', openaiApiKey: 'key', openaiModel: 'unknown-openai' }, imageProblem)).rejects.toThrow('Görseli okuyabildiği');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('okunabilir PDF içinde diyagram olabileceği için görsel desteği bilinmeyen modeli elemez diye varsaymaz', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const pdfProblem: ProblemInput = { ...problem, attachments: [{ id: 'pdf', name: 'soru.pdf', type: 'pdf', mimeType: 'application/pdf', data: 'invalid' }] };
    await expect(recommendModel({ ...DEFAULT_CONFIG, openaiApiKey: 'key', openaiModel: 'unknown-openai' }, pdfProblem)).rejects.toThrow('Görseli okuyabildiği');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('öneri modeli yanıt vermezse en ucuz model diye atlamaz, mevcut seçimi korur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await recommendModel({ ...DEFAULT_CONFIG, activeProvider: 'gemini', openaiApiKey: 'key', geminiApiKey: 'key' }, problem);
    expect(result.method).toBe('local');
    expect(result.suggestedId).toBe('gemini:gemini-3.6-flash');
  });

  it('elle değiştirilen öneri modelini kaynak yapılandırmasına uygular', () => {
    const choice = { id: 'gemini:gemini-4-pro', provider: 'gemini' as const, model: 'gemini-4-pro', label: 'Gemini 4 Pro' };
    const result = configForModelChoice(DEFAULT_CONFIG, choice);
    expect(result.activeProvider).toBe('gemini');
    expect(result.geminiModel).toBe('gemini-4-pro');
  });

  it('hiçbir gerçek sağlayıcı yapılandırılmadıysa demo başlatmaz', async () => {
    await expect(recommendModel(DEFAULT_CONFIG, problem)).rejects.toThrow('API anahtarı');
  });
});
