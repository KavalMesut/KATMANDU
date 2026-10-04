import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '../providers/geminiProvider';
import { AppConfig, DEFAULT_CONFIG } from '../domain/config';
import { ProblemInput, ExpansionRequest } from '../domain/types';

describe('GeminiProvider (Google Gemini 2.5 Flash Entegrasyonu)', () => {
  const sampleConfig: AppConfig = {
    ...DEFAULT_CONFIG,
    activeProvider: 'gemini',
    geminiApiKey: 'test-gemini-key-123',
    geminiModel: 'gemini-3.6-flash',
    geminiThinkingLevel: 'medium'
  };

  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('API anahtarı eksikse hata fırlatmalıdır', async () => {
    const invalidConfig: AppConfig = { ...sampleConfig, geminiApiKey: '' };
    const provider = new GeminiProvider(invalidConfig);

    const problem: ProblemInput = {
      id: 'p1',
      text: 'Basit sarkaç',
      createdAt: Date.now()
    };

    await expect(provider.solve(problem)).rejects.toThrow('Google Gemini API Anahtarı bulunamadı');
  });

  it('Gemini API yanıtını doğru ayrıştırıp RawSolutionResponse döndürmelidir', async () => {
    const mockGeminiResponse = {
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 30, thoughtsTokenCount: 10, totalTokenCount: 60 },
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  problemTitle: 'Gemini Çözümü: Harmonik Salınım',
                  strategy: 'Enerji ve Newton dengesi',
                  assumptions: ['İdeal yay', 'Kütlesiz ortam'],
                  sections: [
                    {
                      title: '1. Hareket Denklemi',
                      blocks: [
                        { kind: 'prose', text: 'Hooke yasası uygulanır:' },
                        { kind: 'equation', latex: 'm\\ddot{x} + kx = 0', explanation: 'Salınım denklemi' }
                      ]
                    }
                  ]
                })
              }
            ]
          }
        }
      ]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGeminiResponse
    });

    const provider = new GeminiProvider(sampleConfig);
    const problem: ProblemInput = {
      id: 'p1',
      text: 'Hooke yasası ile harmonik salınım',
      createdAt: Date.now()
    };

    const res = await provider.solve(problem);
    expect(res.problemTitle).toBe('Gemini Çözümü: Harmonik Salınım');
    expect(provider.usageTracker.snapshot().totalTokens).toBe(60);
    expect(res.sections[0].blocks.length).toBe(2);

    // Credentials belong in the header, never in the request URL.
    const [requestUrl] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(requestUrl)).not.toContain(sampleConfig.geminiApiKey);
    expect(String(requestUrl)).not.toContain('?key=');

    // fetch çağrısının Gemini endpoint'ine gittiğini doğrula
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-3.6-flash:generateContent'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': sampleConfig.geminiApiKey }
      })
    );
  });

  it('expand() çağrıldığında alt katman türetimini doğru üretmelidir', async () => {
    const mockExpansionResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  title: 'Gemini Türetimi: Hooke Yasası ve Potansiyel Enerji',
                  explanation: 'Kuvvet gradyeni ve potansiyel kuyu incelenir.',
                  isAxiomatic: false,
                  isTerminal: false,
                  blocks: [
                    { kind: 'prose', text: 'Türetim adımı:' },
                    { kind: 'equation', latex: 'F = -\\nabla U', explanation: 'Kuvvet-potansiyel ilişkisi' }
                  ]
                })
              }
            ]
          }
        }
      ]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockExpansionResponse
    });

    const provider = new GeminiProvider(sampleConfig);
    const request: ExpansionRequest = {
      problemText: 'Hooke yasası',
      parentSectionTitle: '1. Hareket Denklemi',
      targetBlock: { id: 'eq1', kind: 'equation', latex: 'm\\ddot{x} + kx = 0' },
      depth: 1,
      ancestorPath: ['Ana Çözüm']
    };

    const res = await provider.expand(request);
    expect(res.title).toContain('Hooke Yasası');
    expect(res.blocks.length).toBe(2);
  });

  it('testConnection() başarılı olduğunda success: true dönmelidir', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"status": "ok"}' }] } }]
      })
    });

    const provider = new GeminiProvider(sampleConfig);
    const result = await provider.testConnection();

    expect(result.success).toBe(true);
    expect(result.message).toContain('bağlantısı başarılı');
    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).not.toContain(sampleConfig.geminiApiKey);
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(sampleConfig.geminiApiKey);
  });

  it('testConnection() geçersiz API anahtarında açıklayıcı hata dönmelidir', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'API_KEY_INVALID: Key not valid' }
      })
    });

    const provider = new GeminiProvider(sampleConfig);
    const result = await provider.testConnection();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Geçersiz Gemini API Anahtarı');
  });

  it('High demand / 503 geçici hatasında ilk deneme başarısız olup 2. denemede başarılı olduğunda otomatik olarak toparlamalıdır', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // İlk çağrıda Google'ın yüksek talep yoğunluğu hatası dönüyor
        return {
          ok: false,
          status: 503,
          json: async () => ({
            error: {
              message:
                'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.'
            }
          })
        };
      }
      // 2. çağrıda başarılı yanıt dönüyor
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      problemTitle: 'Otomatik Yeniden Denenen Çözüm',
                      strategy: 'Yeniden deneme testi',
                      assumptions: [],
                      sections: []
                    })
                  }
                ]
              }
            }
          ]
        })
      };
    });

    // Testlerin hızlı çalışması için retryBaseDelayMs = 0 geçiyoruz
    const provider = new GeminiProvider(sampleConfig, 0);
    const res = await provider.solve({ id: 'p_retry', text: 'Test', createdAt: Date.now() });

    expect(callCount).toBe(2);
    expect(res.problemTitle).toBe('Otomatik Yeniden Denenen Çözüm');
  });

  it('Tüm denemeler (3 kez) başarısız olduğunda kullanıcı dostu High Demand hatası fırlatmalıdır', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            message:
              'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.'
          }
        })
      };
    });

    const provider = new GeminiProvider(sampleConfig, 0);
    await expect(
      provider.solve({ id: 'p_retry_fail', text: 'Test', createdAt: Date.now() })
    ).rejects.toThrow('aşırı talep yoğunluğu');

    // 1 ilk çağrı + 3 yeniden deneme = 4 toplam çağrı
    expect(callCount).toBe(4);
  });

  it('testConnection() 503 / High demand durumunda kullanıcı dostu açıklama dönmelidir', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.'
        }
      })
    });

    const provider = new GeminiProvider(sampleConfig, 0);
    const result = await provider.testConnection();

    expect(result.success).toBe(false);
    expect(result.message).toContain('aşırı talep yoğunluğu (High Demand)');
  });
});
