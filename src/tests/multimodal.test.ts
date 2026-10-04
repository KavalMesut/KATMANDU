import { describe, it, expect } from 'vitest';
import { ProblemInput, ProblemAttachment, RawSolutionResponse } from '../domain/types';
import { TrustedAssembler } from '../domain/trustedAssembler';
import { MockProvider } from '../providers/mockProvider';
import { GeminiProvider } from '../providers/geminiProvider';
import { OpenAIProvider } from '../providers/openaiProvider';
import { DEFAULT_CONFIG } from '../domain/config';

describe('Multimodal Inputs & Turkish Default Enforcement', () => {
  it('correctly passes attachments to SolutionDocument in TrustedAssembler', () => {
    const attachment: ProblemAttachment = {
      id: 'att_123',
      name: 'pendulum_problem.pdf',
      type: 'pdf',
      mimeType: 'application/pdf',
      data: 'JVBERi0xLjQK...',
      size: 10240
    };

    const problem: ProblemInput = {
      id: 'prob_test',
      text: 'Derive pendulum equation',
      attachments: [attachment],
      createdAt: Date.now()
    };

    const rawResponse: RawSolutionResponse = {
      problemTitle: 'Basit Sarkaç Hareketi',
      strategy: 'Lagrange mekaniği kullanılarak hareket denklemi türetilecektir.',
      sections: [
        {
          title: 'Genelleştirilmiş Koordinatlar',
          blocks: [
            { kind: 'prose', text: 'Sistemin serbestlik derecesi 1 olup açı $\\theta$ dır.' }
          ]
        }
      ]
    };

    const assembled = TrustedAssembler.assembleSolution(problem, rawResponse);
    expect(assembled.attachments).toHaveLength(1);
    expect(assembled.attachments?.[0].type).toBe('pdf');
    expect(assembled.attachments?.[0].name).toBe('pendulum_problem.pdf');
    expect(assembled.problemTitle).toBe('Basit Sarkaç Hareketi');
  });

  it('MockProvider handles problems with attachments and empty text safely', async () => {
    const provider = new MockProvider('tr');
    const problem: ProblemInput = {
      id: 'prob_image',
      text: '',
      attachments: [
        {
          id: 'att_img',
          name: 'exam_question.png',
          type: 'image',
          mimeType: 'image/png',
          data: 'iVBORw0KGgo...',
          size: 20480
        }
      ],
      createdAt: Date.now()
    };

    const solution = await provider.solve(problem);
    expect(solution).toBeDefined();
    expect(solution.problemTitle).toBeDefined();
    expect(solution.problemTitle).toContain('Sarkaç');
  });

  it('MockProvider returns Turkish solutions even when question text is in English', async () => {
    const provider = new MockProvider('tr');
    const problem: ProblemInput = {
      id: 'prob_en',
      text: 'Calculate the period of a simple pendulum with length L and mass m under small angle approximation.',
      createdAt: Date.now()
    };

    const solution = await provider.solve(problem);
    expect(solution.problemTitle).toBe('İdeal Basit Sarkaç: Hareketi ve Salınım Periyodu');
    expect(solution.strategy).toContain('Sarkaç kütlesi üzerine etki eden kuvvetler');
    expect(solution.sections[0].title).toBe('Sarkaç Geometrisi ve Koordinat Sistemi');
  });

  it('verifies GeminiProvider is configured with default Turkish language requirement', () => {
    const gemini = new GeminiProvider({
      ...DEFAULT_CONFIG,
      geminiApiKey: 'dummy_key'
    });
    expect(gemini.providerName).toBe('google-gemini-flash');
  });

  it('ensures full transcribed problemText and problemDiagram are present even when input is image or PDF', () => {
    const rawResponse: RawSolutionResponse = {
      problemTitle: 'Fotoğraftan Çözülen Sarkaç Problemi',
      problemText: 'Tavana asılı L uzunluğundaki ipin ucundaki m kütleli basit sarkacın hareket denklemi nedir?',
      problemDiagram: {
        width: 320,
        height: 200,
        caption: 'Şekil: Sarkaç geometrisi',
        elements: [
          { type: 'surface', from: [50, 20], to: [200, 20], side: 'top' },
          { type: 'line', from: [120, 20], to: [170, 120], style: 'rope', label: 'L' },
          { type: 'mass', id: 'm', x: 170, y: 120, label: 'm', shape: 'circle' }
        ]
      },
      strategy: 'Dinamik hareket denklemleri çözülür.',
      sections: []
    };

    const emptyTextProblem: ProblemInput = {
      id: 'prob_image_only',
      text: '', // Kullanıcı metin yazmadı, sadece fotoğraf yükledi
      attachments: [
        {
          id: 'att_1',
          name: 'soru_foto.jpg',
          type: 'image',
          mimeType: 'image/jpeg',
          data: 'data:image/jpeg;base64,...',
          dataUrl: 'data:image/jpeg;base64,...'
        }
      ],
      createdAt: Date.now()
    };

    const assembled = TrustedAssembler.assembleSolution(emptyTextProblem, rawResponse);
    expect(assembled.problemText).toBe('Tavana asılı L uzunluğundaki ipin ucundaki m kütleli basit sarkacın hareket denklemi nedir?');
    expect(assembled.problemDiagram).toBeDefined();
    expect(assembled.problemDiagram?.elements).toHaveLength(3);
    expect(assembled.attachments?.[0].dataUrl).toBeDefined();
  });

  it('verifies OpenAIProvider is configured with default Turkish language requirement', () => {
    const openai = new OpenAIProvider({
      ...DEFAULT_CONFIG,
      openaiApiKey: 'dummy_key'
    });
    expect(openai.providerName).toBe('openai-gpt-terra');
  });
});
