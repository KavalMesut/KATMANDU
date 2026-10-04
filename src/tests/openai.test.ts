import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '../providers/openaiProvider';
import { AppConfig, DEFAULT_CONFIG } from '../domain/config';
import { ProblemInput } from '../domain/types';

describe('OpenAIProvider (GPT-5.6 Terra)', () => {
  const dummyConfig: AppConfig = {
    ...DEFAULT_CONFIG,
    activeProvider: 'openai',
    openaiApiKey: 'sk-test-fake-key-12345',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-5.6-terra',
    openaiReasoningEffort: 'medium'
  };

  const dummyProblem: ProblemInput = {
    id: 'test_prob',
    text: 'Eğik düzlemde m kütleli blok',
    createdAt: Date.now()
  };

  it('API anahtarı boş olduğunda net bir hata fırlatmalıdır', async () => {
    const providerWithoutKey = new OpenAIProvider({
      ...dummyConfig,
      openaiApiKey: ''
    });

    await expect(providerWithoutKey.solve(dummyProblem)).rejects.toThrow(
      'OpenAI API anahtarı tanımlanmamış'
    );
  });

  it('Doğru model (gpt-5.6-terra) ve reasoning_effort (medium) parametrelerini göndermelidir', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
        choices: [
          {
            message: {
              content: JSON.stringify({
                problemTitle: 'Eğik Düzlem Çözümü',
                strategy: 'Kuvvet dengesi',
                assumptions: ['Sürtünme ihmal'],
                sections: [
                  {
                    title: 'Dinamik Denklem',
                    blocks: [
                      { kind: 'prose', text: 'Yerçekimi ivmesi' },
                      { kind: 'equation', latex: 'F = mg\\sin\\theta' }
                    ]
                  }
                ]
              })
            }
          }
        ]
      })
    });

    global.fetch = mockFetch;

    const provider = new OpenAIProvider(dummyConfig);
    const result = await provider.solve(dummyProblem);

    expect(result.problemTitle).toBe('Eğik Düzlem Çözümü');
    expect(provider.usageTracker.snapshot().totalTokens).toBe(50);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    const url = callArgs[0];
    const options = callArgs[1];
    const body = JSON.parse(options.body);

    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(body.model).toBe('gpt-5.6-terra');
    expect(body.reasoning_effort).toBe('medium');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('yeni model Chat Completions desteklemiyorsa Responses API ile çözümü tekrar dener', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'Model is not supported in /v1/chat/completions; use Responses API' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ problemTitle: 'Yeni Model Çözümü', strategy: 'Test', sections: [] }) }] }] }) });
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIProvider({ ...dummyConfig, openaiModel: 'gpt-6-sol' }, 0).solve(dummyProblem);

    expect(result.problemTitle).toBe('Yeni Model Çözümü');
    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.openai.com/v1/chat/completions',
      'https://api.openai.com/v1/responses'
    ]);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).model).toBe('gpt-6-sol');
  });

  it('Geçici hata (HTTP 503 Overloaded) durumunda otomatik yeniden deneyip 2. denemede başarılı olmalıdır', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            error: { message: 'The server is currently overloaded. Please try again later.' }
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  problemTitle: 'Başarılı Çözüm',
                  strategy: 'Test',
                  assumptions: [],
                  sections: []
                })
              }
            }
          ]
        })
      };
    });

    global.fetch = mockFetch;

    // retryBaseDelayMs = 0 ile beklemesiz test
    const provider = new OpenAIProvider(dummyConfig, 0);
    const result = await provider.solve(dummyProblem);

    expect(callCount).toBe(2);
    expect(result.problemTitle).toBe('Başarılı Çözüm');
  });

  it('Tüm yeniden denemeler tükendiğinde kullanıcı dostu açıklama fırlatmalıdır', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: { message: 'The server is currently overloaded. Please try again later.' }
      })
    });

    global.fetch = mockFetch;

    const provider = new OpenAIProvider(dummyConfig, 0);
    await expect(provider.solve(dummyProblem)).rejects.toThrow(
      'OpenAI sunucuları aşırı yoğunluk yaşıyor'
    );
    expect(mockFetch).toHaveBeenCalledTimes(4); // İlk deneme + 3 retry
  });

  it('PDF eki yüklendiğinde belgenin tamamını OpenAI istek mesajına eklemelidir', async () => {

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                problemTitle: 'PDF Soru Çözümü',
                strategy: 'Hooke yasası',
                sections: []
              })
            }
          }
        ]
      })
    });
    global.fetch = mockFetch;

    const problemWithPdf: ProblemInput = {
      id: 'prob_pdf',
      text: '',
      attachments: [
        {
          id: 'att_pdf_1',
          name: 'sinav_sorusu.pdf',
          type: 'pdf',
          mimeType: 'application/pdf',
          data: btoa('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'),
          size: 1024
        }
      ],
      createdAt: Date.now()
    };

    const provider = new OpenAIProvider(dummyConfig, 0);
    const res = await provider.solve(problemWithPdf);

    expect(res.problemTitle).toBe('PDF Soru Çözümü');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMsg = body.messages.find((m: any) => m.role === 'user');
    expect(userMsg).toBeDefined();

    const userContent = typeof userMsg.content === 'string'
      ? userMsg.content
      : JSON.stringify(userMsg.content);

    expect(userMsg.content).toContainEqual({ type: 'file', file: { filename: 'sinav_sorusu.pdf', file_data: `data:application/pdf;base64,${problemWithPdf.attachments![0].data}` } });
    expect(userContent).toContain('sinav_sorusu.pdf');
    expect(userContent).toContain('data:application/pdf;base64,');
  });

  it('detectQuestions metodu PDF belgesinin tamamını soru tespit modeline iletmelidir', async () => {

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  { questionNumber: 1, title: 'Soru 1', instruction: 'Basit sarkaç' },
                  { questionNumber: 2, title: 'Soru 2', instruction: 'Eğik düzlem' }
                ]
              })
            }
          }
        ]
      })
    });
    global.fetch = mockFetch;

    const problemWithPdf: ProblemInput = {
      id: 'prob_pdf_multi',
      text: '',
      attachments: [
        {
          id: 'att_pdf_2',
          name: 'vize.pdf',
          type: 'pdf',
          mimeType: 'application/pdf',
          data: btoa('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'),
          size: 2048
        }
      ],
      createdAt: Date.now()
    };

    const provider = new OpenAIProvider(dummyConfig, 0);
    const detected = await provider.detectQuestions(problemWithPdf);

    expect(detected.length).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMsg = body.messages.find((m: any) => m.role === 'user');
    const userContent = typeof userMsg.content === 'string'
      ? userMsg.content
      : JSON.stringify(userMsg.content);

    expect(userContent).toContain('vize.pdf');
    expect(userMsg.content).toContainEqual({ type: 'file', file: { filename: 'vize.pdf', file_data: `data:application/pdf;base64,${problemWithPdf.attachments![0].data}` } });
  });

  it('PDF eki bozuk veya okunamadığında kör halüsinasyon yerine net bir hata fırlatmalıdır', async () => {

    const problemWithUnreadablePdf: ProblemInput = {
      id: 'prob_corrupted_pdf',
      text: '',
      attachments: [
        {
          id: 'att_corrupted',
          name: 'bozuk_belge.pdf',
          type: 'pdf',
          mimeType: 'application/pdf',
          data: 'JVBERi0xLjQK...',
          size: 512
        }
      ],
      createdAt: Date.now()
    };

    const provider = new OpenAIProvider(dummyConfig, 0);
    await expect(provider.solve(problemWithUnreadablePdf)).rejects.toThrow(
      'PDF okunamadı: bozuk_belge.pdf.'
    );
  });
});
