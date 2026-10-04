import { describe, it, expect } from 'vitest';
import { detectMultipleQuestions } from '../domain/questionParser';
import { ProblemTab, ExpansionLayer } from '../domain/types';

describe('Çoklu Soru Tespiti (detectMultipleQuestions)', () => {
  it('boş veya geçersiz girdi için boş dizi döner', () => {
    expect(detectMultipleQuestions('')).toEqual([]);
    expect(detectMultipleQuestions('   ')).toEqual([]);
  });

  it('düz tekil metni tek elemanlı dizi olarak döner', () => {
    const text = 'Uzunluğu L olan basit sarkacın periyodunu bulunuz.';
    const result = detectMultipleQuestions(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it('"---" (Markdown ayırıcı) ile ayrılmış soruları parçalar', () => {
    const text = `
Uzunluğu L olan basit sarkacın hareket denklemini yazınız.
---
m kütleli bir takozun sürtünmeli eğik düzlemdeki ivmesini bulunuz.
---
R yarıçaplı kürenin eylemsizlik momentini integral ile hesaplayınız.
    `.trim();

    const result = detectMultipleQuestions(text);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain('basit sarkacın');
    expect(result[1]).toContain('sürtünmeli eğik düzlemdeki');
    expect(result[2]).toContain('eylemsizlik momentini');
  });

  it('"===" ile ayrılmış soruları parçalar', () => {
    const text = `
Problem A: Serbest düşme
===
Problem B: Yay sarkacı
    `.trim();

    const result = detectMultipleQuestions(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('Serbest düşme');
    expect(result[1]).toContain('Yay sarkacı');
  });

  it('"Soru 1:", "Soru 2:" biçimindeki soruları parçalar', () => {
    const text = `
Soru 1:
Newton'un ikinci yasasını kullanarak harmonik osilatörü çözünüz.

Soru 2:
Termodinamiğin birinci yasasını adyabatik süreç için ifade ediniz.
    `.trim();

    const result = detectMultipleQuestions(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('harmonik osilatörü');
    expect(result[1]).toContain('adyabatik süreç');
  });

  it('"Problem 1.", "Problem 2." biçimindeki soruları parçalar', () => {
    const text = `
Problem 1.
Elektrostatikte Gauss yasasını küresel yük dağılımı için uygulayınız.

Problem 2.
Biot-Savart yasası ile sonsuz uzun telin manyetik alanını türetiniz.
    `.trim();

    const result = detectMultipleQuestions(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('Gauss yasasını');
    expect(result[1]).toContain('Biot-Savart');
  });
});

describe('Çoklu Problem Sekme İzolasyonu (Tab Isolation)', () => {
  it('farklı sekmeler kendi derinleşme katmanlarını ve açık durumlarını bağımsız tutar', () => {
    const tab1Layer: ExpansionLayer = {
      id: 'tab1_layer_1',
      targetBlockId: 'b1',
      targetDisplayNumber: 1,
      depth: 1,
      title: 'Soru 1 - Adım 1 İspatı',
      isAxiomatic: false,
      isTerminal: false,
      blocks: []
    };

    const tab2Layer: ExpansionLayer = {
      id: 'tab2_layer_1',
      targetBlockId: 'b2',
      targetDisplayNumber: 2,
      depth: 1,
      title: 'Soru 2 - Enerji Korunumu',
      isAxiomatic: false,
      isTerminal: false,
      blocks: []
    };

    const tab1: ProblemTab = {
      id: 'tab_1',
      tabTitle: 'Soru 1',
      problem: { id: 'p1', text: 'Sarkaç', createdAt: 100 },
      document: null,
      expansionCache: { [tab1Layer.id]: tab1Layer },
      tree: { id: 'root', parentId: null, label: 'Kök 1', depth: 0, children: [] },
      openLayerIds: ['tab1_layer_1'],
      focusedNodeId: 'tab1_layer_1',
      selectedEquation: null,
      isLoading: false,
      errorMessage: null,
      activeLibraryItemId: null
    };

    const tab2: ProblemTab = {
      id: 'tab_2',
      tabTitle: 'Soru 2',
      problem: { id: 'p2', text: 'Eğik Düzlem', createdAt: 200 },
      document: null,
      expansionCache: { [tab2Layer.id]: tab2Layer },
      tree: { id: 'root', parentId: null, label: 'Kök 2', depth: 0, children: [] },
      openLayerIds: [], // Sekme 2'de henüz hiçbir akordeon açık değil
      focusedNodeId: 'root',
      selectedEquation: null,
      isLoading: false,
      errorMessage: null,
      activeLibraryItemId: null
    };

    // Sekme 1 ve Sekme 2 izole olmalıdır
    expect(Object.keys(tab1.expansionCache)).toContain('tab1_layer_1');
    expect(Object.keys(tab1.expansionCache)).not.toContain('tab2_layer_1');

    expect(Object.keys(tab2.expansionCache)).toContain('tab2_layer_1');
    expect(Object.keys(tab2.expansionCache)).not.toContain('tab1_layer_1');

    expect(tab1.openLayerIds).toContain('tab1_layer_1');
    expect(tab2.openLayerIds).toHaveLength(0);

    // Sekme 1'deki bir katmanı açıp kapatmak Sekme 2'yi etkilemez
    const updatedTab1: ProblemTab = {
      ...tab1,
      openLayerIds: []
    };
    expect(updatedTab1.openLayerIds).toHaveLength(0);
    expect(tab2.expansionCache['tab2_layer_1'].title).toBe('Soru 2 - Enerji Korunumu');
  });
});

import {
  buildQuestionDetectionPrompt,
  parseDetectedQuestions
} from '../domain/questionParser';
import { MockProvider } from '../providers/mockProvider';

describe('Yapay Zekâ Çoklu Soru Tespiti (AI Question Detection & Splitting)', () => {
  it('buildQuestionDetectionPrompt geçerli JSON şeması yönergelerini içerir', () => {
    const prompt = buildQuestionDetectionPrompt();
    expect(prompt).toContain('questionCount');
    expect(prompt).toContain('questions');
    expect(prompt).toContain('instruction');
  });

  it('parseDetectedQuestions geçerli çoklu soru JSON nesnesini doğru ayrıştırır', () => {
    const mockJson = {
      questionCount: 2,
      questions: [
        {
          questionNumber: 1,
          title: 'Soru 1: Basit Sarkaç',
          summary: 'Küçük açılı salınım frekansı',
          instruction: 'Dokümandaki 1. soruyu çöz.'
        },
        {
          questionNumber: 2,
          title: 'Soru 2: Çift Kütleli Kama',
          summary: 'Kama ve blok ivmesi',
          instruction: 'Dokümandaki 2. soruyu çöz.'
        }
      ]
    };

    const result = parseDetectedQuestions(mockJson);
    expect(result).toHaveLength(2);
    expect(result[0].questionNumber).toBe(1);
    expect(result[0].title).toBe('Soru 1: Basit Sarkaç');
    expect(result[0].instruction).toBe('Dokümandaki 1. soruyu çöz.');
    expect(result[1].questionNumber).toBe(2);
    expect(result[1].title).toBe('Soru 2: Çift Kütleli Kama');
  });

  it('parseDetectedQuestions geçersiz veya boş yanıtta tek soru ile fail-soft davranır', () => {
    const fallbackText = 'Varsayılan problem metni';
    const resultEmpty = parseDetectedQuestions(null, fallbackText);
    expect(resultEmpty).toHaveLength(1);
    expect(resultEmpty[0].instruction).toBe(fallbackText);

    const resultInvalid = parseDetectedQuestions({ foo: 'bar' }, fallbackText);
    expect(resultInvalid).toHaveLength(1);
    expect(resultInvalid[0].instruction).toBe(fallbackText);
  });

  it('MockProvider tek bir girdide birden fazla soru olduğunu anladığında soruları ayrı ayrı döner', async () => {
    const mock = new MockProvider('tr');

    // 1. "coklu" anahtar kelimesi içeren tek bir problem
    const multiProblem = {
      id: 'p_multi',
      text: 'Bu sayfada coklu soru bulunmaktadır, lütfen çözünüz.',
      createdAt: Date.now()
    };

    const detected = await mock.detectQuestions(multiProblem);
    expect(detected).toHaveLength(2);
    expect(detected[0].title).toContain('Soru 1');
    expect(detected[1].title).toContain('Soru 2');
    expect(detected[0].instruction).toContain('1. soruyu');
    expect(detected[1].instruction).toContain('2. soruyu');
  });

  it('MockProvider tek bir soru içeren girdide tek soru döner', async () => {
    const mock = new MockProvider('tr');

    const singleProblem = {
      id: 'p_single',
      text: 'Uzunluğu L olan basit sarkacın salınım periyodu nedir?',
      createdAt: Date.now()
    };

    const detected = await mock.detectQuestions(singleProblem);
    expect(detected).toHaveLength(1);
    expect(detected[0].questionNumber).toBe(1);
    expect(detected[0].instruction).toBe(singleProblem.text);
  });

  it('MockProvider dosya eklerinde birden fazla soru tespiti simülasyonunu destekler', async () => {
    const mock = new MockProvider('tr');

    const fileProblem = {
      id: 'p_file',
      text: '',
      attachments: [
        {
          id: 'att_1',
          name: 'sinav_sayfasi_multiple_questions.png',
          type: 'image' as const,
          mimeType: 'image/png',
          data: 'base64data'
        }
      ],
      createdAt: Date.now()
    };

    const detected = await mock.detectQuestions(fileProblem);
    expect(detected.length).toBeGreaterThan(1);
    expect(detected[0].title).toBe('Soru 1: İdeal Basit Sarkaç');
    expect(detected[1].title).toBe('Soru 2: Yaylı Hareketli Kama');
  });
});

