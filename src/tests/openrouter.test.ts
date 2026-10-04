import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from '../providers/openRouterProvider';
import { AppConfig, DEFAULT_CONFIG } from '../domain/config';
import { ProblemInput, ExpansionRequest } from '../domain/types';
import * as modelCatalog from '../domain/modelCatalog';
import { createProviderSession } from '../providers/providerSession';

describe('OpenRouterProvider Entegrasyonu (Claude 3.7, DeepSeek R1, GPT-4o)', () => {
  let mockConfig: AppConfig;
  const originalFetch = global.fetch;

  const dummyProblem: ProblemInput = {
    id: 'prob_test_1',
    text: 'Basit sarkaç periyodu',
    createdAt: Date.now()
  };

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_CONFIG,
      activeProvider: 'openrouter',
      openrouterApiKey: 'openrouter-test-fixture',
      openrouterBaseUrl: 'https://openrouter.ai/api/v1',
      openrouterModel: 'anthropic/claude-sonnet-4.6'
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('API anahtarı tanımlanmadığında açıklayıcı hata fırlatmalıdır', async () => {
    const provider = new OpenRouterProvider({ ...mockConfig, openrouterApiKey: '' });
    await expect(provider.solve(dummyProblem)).rejects.toThrow(
      /OpenRouter API anahtarı tanımlanmamış/
    );
  });

  it('OpenRouter başlıklarını (HTTP-Referer, X-Title) ve seçilen modeli doğru göndermelidir', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = JSON.parse(init?.body as string);

      return {
        ok: true,
        json: async () => ({
          usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50, cost: 0.00012 },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  problemTitle: 'Claude 3.7 ile Sarkac Hareketi',
                  problemText: 'Basit sarkacın salınım periyodu nedir?',
                  strategy: 'Newton mekaniği',
                  assumptions: ['Küçük açılar'],
                  sections: [
                    {
                      title: 'Hareket Denklemi',
                      blocks: [
                        { kind: 'prose', text: 'Tork dengesinden:' },
                        { kind: 'equation', latex: 'T = 2\\pi \\sqrt{\\frac{L}{g}}' }
                      ]
                    }
                  ],
                  verification: {
                    dimensionalAnalysis: '[T] = saniye',
                    limitingCases: [{ condition: 'g -> 0', expected: 'T -> inf', analysis: 'Limit kontrolü' }]
                  }
                })
              }
            }
          ]
        })
      } as Response;
    });

    const provider = new OpenRouterProvider(mockConfig);
    const result = await provider.solve(dummyProblem);

    expect(capturedUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(capturedHeaders['Authorization']).toBe('Bearer openrouter-test-fixture');
    expect(capturedHeaders['HTTP-Referer']).toBe('https://katmandu.ai');
    expect(capturedHeaders['X-Title']).toBe('KATMANDU - Academic Derivation Engine');
    expect(capturedBody.model).toBe('anthropic/claude-sonnet-4.6');
    expect(capturedBody.usage).toEqual({ include: true });
    expect(result.problemTitle).toBe('Claude 3.7 ile Sarkac Hareketi');
    expect(provider.usageTracker.snapshot().totalTokens).toBe(50);
    expect(provider.usageTracker.costSnapshot()).toBe(0.00012);
  });

  it('Düşünce etiketlerini (<think>...</think>) temizleyip JSON çıktısını hatasız ayrıştırmalıdır', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: `<think>
Burada derin matematiksel akıl yürütme yapıyorum...
Formülleri kontrol ediyorum...
</think>
\`\`\`json
{
  "problemTitle": "DeepSeek R1 Çözümü",
  "problemText": "Serbest düşme",
  "strategy": "Kinetik enerji",
  "assumptions": [],
  "sections": [
    {
      "title": "Çözüm",
      "blocks": [
        { "kind": "equation", "latex": "v = \\sqrt{2gh}" }
      ]
    }
  ]
}
\`\`\``
              }
            }
          ]
        })
      } as Response;
    });

    const provider = new OpenRouterProvider({
      ...mockConfig,
      openrouterModel: 'deepseek/deepseek-r1'
    });

    const result = await provider.solve(dummyProblem);
    expect(result.problemTitle).toBe('DeepSeek R1 Çözümü');
    expect(result.sections[0].blocks[0].kind).toBe('equation');
  });

  it('Bakiye yetersiz olduğunda (HTTP 402 Payment Required) net kullanıcı hatası fırlatmalıdır', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 402,
        json: async () => ({
          error: { message: 'User has insufficient credits' }
        })
      } as Response;
    });

    const provider = new OpenRouterProvider(mockConfig);
    await expect(provider.solve(dummyProblem)).rejects.toThrow(
      /OpenRouter bakiye yetersiz/
    );
  });

  it('Türetim (expand) çağrısını OpenRouter üzerinden başarıyla gerçekleştirmelidir', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Pisagor Teoremi ve Hipotenüs',
                  explanation: 'Öklid dik üçgen geometrisinde alan bağıntısı',
                  isAxiomatic: false,
                  isTerminal: false,
                  axiomType: 'mathematics',
                  blocks: [
                    { kind: 'prose', text: 'Öklid düzleminde kenar kareleri toplamı:' },
                    { kind: 'equation', latex: 'a^2 + b^2 = c^2' }
                  ]
                })
              }
            }
          ]
        })
      } as Response;
    });

    const provider = new OpenRouterProvider(mockConfig);
    const expRequest: ExpansionRequest = {
      problemText: 'Eğik atış problemi',
      parentSectionTitle: 'Hız Vektörü',
      depth: 1,
      targetBlock: { id: 'b1', kind: 'equation', latex: 'v = \\sqrt{v_x^2 + v_y^2}' },
      ancestorPath: ['Hız Vektörü']
    };

    const expResult = await provider.expand(expRequest);
    expect(expResult.title).toBe('Pisagor Teoremi ve Hipotenüs');
    expect(expResult.axiomType).toBe('mathematics');
    expect(expResult.blocks.length).toBe(2);
  });

  it('Katalog doğrulamıyorsa modele desteklenmeyen isteğe bağlı parametreleri göndermemelidir', async () => {
    let capturedBody: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  problemTitle: 'Test',
                  problemText: 'Test',
                  strategy: 'Test',
                  assumptions: [],
                  sections: []
                })
              }
            }
          ]
        })
      } as Response;
    });

    const provider = new OpenRouterProvider({
      ...mockConfig,
      openrouterReasoningEffort: 'medium'
    });
    await provider.solve(dummyProblem);

    expect(capturedBody).not.toHaveProperty('reasoning');
    expect(capturedBody).not.toHaveProperty('reasoning_effort');
    expect(capturedBody).not.toHaveProperty('response_format');
    expect(provider.appliedReasoningEffort).toBeUndefined();
  });

  it('Uç noktalar parametre nedeniyle elenirse aynı modeli yalın istekle bir kez dener', async () => {
    vi.spyOn(modelCatalog, 'readCachedModels').mockReturnValue([{
      id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', provider: 'openrouter',
      supportedParameters: ['reasoning', 'response_format']
    }]);
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) return {
        ok: false, status: 404,
        json: async () => ({ error: { message: 'No endpoints found for meta-llama/llama-4-scout. Filter by Parameters removed deepinfra/fp8, novita/bf16' } })
      } as Response;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          problemTitle: 'Çözüm', problemText: 'Soru', strategy: 'Yöntem', assumptions: [], sections: []
        }) } }] })
      } as Response;
    });
    const provider = new OpenRouterProvider({ ...mockConfig, openrouterModel: 'meta-llama/llama-4-scout' }, 0);
    await expect(provider.solve(dummyProblem)).resolves.toMatchObject({ problemTitle: 'Çözüm' });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ reasoning: { effort: 'low' }, response_format: { type: 'json_object' } });
    expect(bodies[1]).not.toHaveProperty('reasoning');
    expect(bodies[1]).not.toHaveProperty('response_format');
    expect(provider.appliedReasoningEffort).toBeUndefined();
  });

  it('Desteklenen akıl yürütme seviyesini yollar ve başarılı isteğin seviyesini kaydeder', async () => {
    vi.spyOn(modelCatalog, 'readCachedModels').mockReturnValue([{
      id: mockConfig.openrouterModel, name: 'Claude', provider: 'openrouter',
      supportedParameters: ['reasoning']
    }]);
    let body: Record<string, unknown> = {};
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        problemTitle: 'Çözüm', problemText: 'Soru', strategy: 'Yöntem', assumptions: [], sections: []
      }) } }] }) } as Response;
    });
    const session = createProviderSession({ ...mockConfig, openrouterReasoningEffort: 'medium' });
    await session.provider!.solve(dummyProblem);
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(session.createMetadata().reasoningEffort).toBe('medium');
  });

  it('Parametresiz istekte de uç nokta yoksa ağ hatası demeden model sorununu bildirir', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ error: { message: 'No endpoints found; Add BYOK Endpoints removed google-vertex' } })
    } as Response);
    const provider = new OpenRouterProvider({ ...mockConfig, openrouterModel: 'meta-llama/llama-4-scout' }, 0);
    await expect(provider.solve(dummyProblem)).rejects.toThrow(/kullanılabilir bir uç nokta bulamadı/);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const finalRequest = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body as string);
    expect(finalRequest).not.toHaveProperty('usage');
  });
});
