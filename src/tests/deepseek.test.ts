import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepSeekProvider } from '../providers/deepseekProvider';
import { AppConfig, DEFAULT_CONFIG } from '../domain/config';
import { ProblemInput, ExpansionRequest } from '../domain/types';

describe('DeepSeekProvider Entegrasyonu (R1 Reasoner & V3)', () => {
  const baseConfig: AppConfig = {
    ...DEFAULT_CONFIG,
    activeProvider: 'deepseek',
    deepseekApiKey: 'sk-deepseek-test-key-12345',
    deepseekBaseUrl: 'https://api.deepseek.com',
    deepseekModel: 'deepseek-reasoner'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sağlayıcı adı ve varsayılan yapılandırmayı doğru belirler', () => {
    const provider = new DeepSeekProvider(baseConfig);
    expect(provider.providerName).toBe('deepseek-reasoner');

    const v3Provider = new DeepSeekProvider({
      ...baseConfig,
      deepseekModel: 'deepseek-chat'
    });
    expect(v3Provider.providerName).toBe('deepseek-chat');
  });

  it('API anahtarı eksik olduğunda açıklayıcı hata fırlatmalıdır', async () => {
    const provider = new DeepSeekProvider({
      ...baseConfig,
      deepseekApiKey: ''
    });

    const problem: ProblemInput = {
      id: 'p1',
      text: 'Basit sarkaç hareket denklemini türetiniz.',
      createdAt: Date.now()
    };

    await expect(provider.solve(problem)).rejects.toThrow(/DeepSeek API anahtarı tanımlanmamış/);
  });

  it('görsel ile giriş yapıldığında (ve metin/PDF yoksa) DeepSeek görsel uyarısı fırlatmalıdır', async () => {
    const provider = new DeepSeekProvider(baseConfig);
    const imageProblem: ProblemInput = {
      id: 'p_img',
      text: '',
      attachments: [
        {
          id: 'att_1',
          name: 'soru_foto.jpg',
          type: 'image',
          mimeType: 'image/jpeg',
          data: 'base64_data...'
        }
      ],
      createdAt: Date.now()
    };

    await expect(provider.solve(imageProblem)).rejects.toThrow(
      /DeepSeek modeli doğrudan görsel \(PNG\/JPG\) analizini desteklememektedir/
    );

    await expect(provider.detectQuestions(imageProblem)).rejects.toThrow(
      /DeepSeek modeli doğrudan görsel \(PNG\/JPG\) analizini desteklememektedir/
    );
  });

  it('elle yazılmış metin problemini başarıyla DeepSeek API formatına dönüştürüp çözmelidir', async () => {
    const provider = new DeepSeekProvider(baseConfig);

    const mockResponsePayload = {
      usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              problemTitle: 'İdeal Basit Sarkaç: Analitik Çözüm',
              problemText: 'L uzunluğundaki ipe bağlı m kütleli sarkacın hareket denklemi.',
              strategy: 'Lagrange mekaniği ile türetim.',
              sections: [
                {
                  title: 'Euler-Lagrange Denklemi',
                  blocks: [
                    { kind: 'prose', text: 'Genelleştirilmiş koordinat $\\theta$ dır.' },
                    { kind: 'equation', latex: '\\ddot{\\theta} + \\frac{g}{L} \\sin\\theta = 0' }
                  ]
                }
              ],
              verification: {
                dimensionalAnalysis: '[g/L] birimi s^-2 dir.',
                limitingCases: []
              }
            })
          }
        }
      ]
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponsePayload
    } as Response);

    const problem: ProblemInput = {
      id: 'p_text',
      text: 'L uzunluğundaki basit sarkacın hareket denklemini çıkarınız.',
      createdAt: Date.now()
    };

    const solution = await provider.solve(problem);
    expect(provider.usageTracker.snapshot().totalTokens).toBe(50);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callOptions] = fetchSpy.mock.calls[0];
    expect(callUrl).toBe('https://api.deepseek.com/chat/completions');

    const body = JSON.parse(callOptions?.body as string);
    expect(body.model).toBe('deepseek-reasoner');
    expect(body.max_tokens).toBe(8192);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('L uzunluğundaki basit sarkacın');

    expect(solution.problemTitle).toBe('İdeal Basit Sarkaç: Analitik Çözüm');
    expect(solution.sections).toHaveLength(1);
    expect(solution.sections[0].title).toBe('Euler-Lagrange Denklemi');
  });

  it('tıklanan denklem için yerinde (inline) teorem derinleşmesi (expand) üretmelidir', async () => {
    const provider = new DeepSeekProvider(baseConfig);

    const mockExpPayload = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              title: 'Hipotenüs ve Pisagor Bağıntısının Geometrik İspatı',
              explanation: 'Öklid geometrisi ve benzer üçgenler yardımıyla türetim.',
              isAxiomatic: false,
              isTerminal: false,
              axiomType: 'mathematics',
              blocks: [
                { kind: 'prose', text: 'Dik kenarları a ve b olan dik üçgende hipotenüs c dir.' },
                { kind: 'equation', latex: 'c^2 = a^2 + b^2' }
              ]
            })
          }
        }
      ]
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockExpPayload
    } as Response);

    const req: ExpansionRequest = {
      problemText: 'Eğik düzlem üzerindeki kütlenin hareketi.',
      parentSectionTitle: 'Kuvvetler ve İzdüşümler',
      targetBlock: {
        id: 'eq_1',
        kind: 'equation',
        latex: 'c = \\sqrt{a^2 + b^2}',
        displayNumber: 1
      },
      depth: 1,
      ancestorPath: ['Ana Çözüm'],
      contextualInquiry: {
        selectedText: 'c = \\sqrt{a^2 + b^2}',
        userQuery: 'Hipotenüs bağıntısını açıkla'
      }
    };

    const exp = await provider.expand(req);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(exp.title).toContain('Hipotenüs ve Pisagor');
    expect(exp.isAxiomatic).toBe(false); // Teorem ispatlanabilirdir, aksiyom değildir
    expect(exp.blocks).toHaveLength(2);
  });

  it('geçici sunucu hatasında (503 Overloaded) otomatik yeniden deneme mekanizmasını çalıştırmalıdır', async () => {
    const provider = new DeepSeekProvider(baseConfig, 0); // test için gecikme 0ms

    const mockSuccess = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              problemTitle: 'Başarılı Toparlanma Çözümü',
              sections: []
            })
          }
        }
      ]
    };

    // 1. çağrı 503 Overloaded, 2. çağrı 200 OK
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'DeepSeek servers are currently overloaded.'
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuccess
      } as Response);

    const problem: ProblemInput = {
      id: 'p_retry',
      text: 'Test sorusu',
      createdAt: Date.now()
    };

    const solution = await provider.solve(problem);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(solution.problemTitle).toBe('Başarılı Toparlanma Çözümü');
  });

  it('metin içinde "---" ile ayrılmış birden fazla soruyu tespit edebilmelidir', async () => {
    const provider = new DeepSeekProvider(baseConfig);
    const multiProblem: ProblemInput = {
      id: 'p_multi',
      text: `Sarkaç periyodu formülünü türetiniz.
---
Yaylı sarkacın diferansiyel denklemini kurunuz.`,
      createdAt: Date.now()
    };

    const detected = await provider.detectQuestions(multiProblem);
    expect(detected).toHaveLength(2);
    expect(detected[0].title).toBe('Soru 1');
    expect(detected[0].instruction).toContain('Sarkaç periyodu');
    expect(detected[1].title).toBe('Soru 2');
    expect(detected[1].instruction).toContain('Yaylı sarkacın');
  });
});
