import { describe, it, expect } from 'vitest';
import { TrustedAssembler, cleanSectionTitle } from '../domain/trustedAssembler';
import { ProblemInput, RawSolutionResponse, RawExpansionResponse } from '../domain/types';

describe('TrustedAssembler', () => {
  const dummyProblem: ProblemInput = {
    id: 'test_prob',
    text: 'Test problem text',
    createdAt: 1000
  };

  const rawSolution: RawSolutionResponse = {
    problemTitle: 'Test Çözüm',
    strategy: 'Test stratejisi',
    assumptions: ['Varsayım 1'],
    sections: [
      {
        title: 'Bölüm 1',
        blocks: [
          { kind: 'prose', text: 'İlk açıklama' },
          { kind: 'equation', latex: 'E = mc^2', explanation: 'Kütle-enerji eşdeğerliği' },
          {
            kind: 'diagram',
            spec: {
              width: 100,
              height: 100,
              elements: [{ type: 'point', x: 50, y: 50, label: 'P' }]
            }
          }
        ]
      },
      {
        title: 'Bölüm 2',
        blocks: [
          { kind: 'equation', latex: 'F = ma', explanation: 'Newton 2' },
          { kind: 'equation', latex: 'p = mv', explanation: 'Momentum' }
        ]
      }
    ]
  };

  it('tüm denklemlere deterministik, ardışık ve tekil numaralar atamalıdır (HD-025)', () => {
    const doc = TrustedAssembler.assembleSolution(dummyProblem, rawSolution);

    expect(doc.totalEquations).toBe(3);

    const eq1 = doc.sections[0].blocks[1];
    const eq2 = doc.sections[1].blocks[0];
    const eq3 = doc.sections[1].blocks[1];

    expect(eq1.kind).toBe('equation');
    if (eq1.kind === 'equation') {
      expect(eq1.displayNumber).toBe(1);
    }

    expect(eq2.kind).toBe('equation');
    if (eq2.kind === 'equation') {
      expect(eq2.displayNumber).toBe(2);
    }

    expect(eq3.kind).toBe('equation');
    if (eq3.kind === 'equation') {
      expect(eq3.displayNumber).toBe(3);
    }
  });

  it('hiçbir blokta mükerrer ID üretilmemelidir', () => {
    const doc = TrustedAssembler.assembleSolution(dummyProblem, rawSolution);
    const ids = new Set<string>();

    for (const section of doc.sections) {
      for (const block of section.blocks) {
        expect(ids.has(block.id)).toBe(false);
        ids.add(block.id);
      }
    }
    expect(ids.size).toBe(5);
  });

  it('öğeleri olan diyagram rendered, boş olan degraded işaretlenmelidir (Fail-soft HD-023)', () => {
    const rawWithEmptyDiag: RawSolutionResponse = {
      problemTitle: 'Boş Diyagram Testi',
      strategy: '',
      sections: [
        {
          title: 'Bölüm',
          blocks: [
            {
              kind: 'diagram',
              spec: { width: 100, height: 100, elements: [] }
            }
          ]
        }
      ]
    };

    const doc = TrustedAssembler.assembleSolution(dummyProblem, rawWithEmptyDiag);
    const diagBlock = doc.sections[0].blocks[0];

    expect(diagBlock.kind).toBe('diagram');
    if (diagBlock.kind === 'diagram') {
      expect(diagBlock.status).toBe('degraded');
    }
  });

  it('expansion katmanına doğru derinlik ve kaynak denklem bilgisi eklenmelidir', () => {
    const rawExp: RawExpansionResponse = {
      title: 'Türetim Katmanı',
      explanation: 'Derin açıklama',
      blocks: [
        { kind: 'prose', text: 'Alt gerekçe' },
        { kind: 'equation', latex: 'a = \\frac{F}{m}' }
      ],
      isTerminal: true
    };

    const layer = TrustedAssembler.assembleExpansionLayer(rawExp, 2, 'sec_1_b2', 1);

    expect(layer.depth).toBe(2);
    expect(layer.targetBlockId).toBe('sec_1_b2');
    expect(layer.targetDisplayNumber).toBe(1);
    expect(layer.isTerminal).toBe(true);
    expect(layer.blocks.length).toBe(2);
  });

  it('bölüm başlıklarındaki mükerrer numaralandırmaları (1. 1., Bölüm 1:, vb.) temizlemelidir', () => {
    expect(cleanSectionTitle('1. 1. Konum, Hız Vektörleri ve Enerji İfadelerinin Türetilmesi'))
      .toBe('Konum, Hız Vektörleri ve Enerji İfadelerinin Türetilmesi');
    expect(cleanSectionTitle('1. Konum, Hız Vektörleri ve Enerji İfadelerinin Türetilmesi'))
      .toBe('Konum, Hız Vektörleri ve Enerji İfadelerinin Türetilmesi');
    expect(cleanSectionTitle('1.1. Konum, Hız Vektörleri'))
      .toBe('Konum, Hız Vektörleri');
    expect(cleanSectionTitle('Bölüm 1: Euler-Lagrange Denklemleri'))
      .toBe('Euler-Lagrange Denklemleri');
    expect(cleanSectionTitle('Bölüm 2 - Hareket Denklemleri'))
      .toBe('Hareket Denklemleri');
    expect(cleanSectionTitle('1) Kinematik Analiz'))
      .toBe('Kinematik Analiz');
    expect(cleanSectionTitle('Section 1: Equations of Motion'))
      .toBe('Equations of Motion');

    // Meşru fiziksel / matematiksel ifadelerin korunduğunu doğrula
    expect(cleanSectionTitle('2-Boyutlu Hareket')).toBe('2-Boyutlu Hareket');
    expect(cleanSectionTitle('3 Boyutlu Uzay')).toBe('3 Boyutlu Uzay');
    expect(cleanSectionTitle('3D Modelleme')).toBe('3D Modelleme');
    expect(cleanSectionTitle('Newton\'un 2. Yasası')).toBe('Newton\'un 2. Yasası');
    expect(cleanSectionTitle('Doğruluk Denetimi')).toBe('Doğruluk Denetimi');

    // Yalnızca numaradan ibaret başlıklarda mantıklı varsayılan ('Bölüm')
    expect(cleanSectionTitle('Bölüm 1')).toBe('Bölüm');
    expect(cleanSectionTitle('1.')).toBe('Bölüm');
  });

  it('assembleSolution çağrıldığında bölüm başlıklarını otomatik olarak temizlemelidir', () => {
    const rawWithNumberedSections: RawSolutionResponse = {
      problemTitle: 'Başlık Testi',
      strategy: 'Strateji',
      sections: [
        {
          title: '1. 1. Konum, Hız Vektörleri ve Enerji İfadelerinin Türetilmesi',
          blocks: [{ kind: 'prose', text: 'Gövde' }]
        },
        {
          title: '2. Euler-Lagrange Denklemleri',
          blocks: [{ kind: 'prose', text: 'Gövde 2' }]
        }
      ]
    };

    const doc = TrustedAssembler.assembleSolution(dummyProblem, rawWithNumberedSections);
    expect(doc.sections[0].title).toBe('Konum, Hız Vektörleri ve Enerji İfadelerinin Türetilmesi');
    expect(doc.sections[1].title).toBe('Euler-Lagrange Denklemleri');
  });

  describe('isComplexMath & splitProseBlock (Matematiksel Atomiklik)', () => {
    it('karmaşık matematiksel ifadeleri doğru tespit etmelidir', () => {
      // Kesir ve kök içeren ifadeler
      expect(TrustedAssembler.isComplexMath('f = \\frac{1}{2\\pi}\\sqrt{\\frac{g\\tan\\theta}{r}}')).toBe(true);
      expect(TrustedAssembler.isComplexMath('\\sqrt{k/m}')).toBe(true);
      expect(TrustedAssembler.isComplexMath('\\frac{d}{dt}p')).toBe(true);
      expect(TrustedAssembler.isComplexMath('\\int_0^t F dt')).toBe(true);
      expect(TrustedAssembler.isComplexMath('\\sum_{i=1}^N m_i')).toBe(true);
      expect(TrustedAssembler.isComplexMath('\\dot{x} + \\ddot{y}')).toBe(true);

      // Basit semboller ve kısa hatırlatmalar (prose içinde kalmalı)
      expect(TrustedAssembler.isComplexMath('m')).toBe(false);
      expect(TrustedAssembler.isComplexMath('\\theta')).toBe(false);
      expect(TrustedAssembler.isComplexMath('L')).toBe(false);
      expect(TrustedAssembler.isComplexMath('F = ma')).toBe(false);
      expect(TrustedAssembler.isComplexMath('E = mc^2')).toBe(false);
      expect(TrustedAssembler.isComplexMath('x = 0')).toBe(false);
    });

    it('prose içindeki karmaşık formülleri ayırıp tekil sembolleri korumalıdır', () => {
      const text = 'Buradan frekans elde edilir: $f = \\frac{1}{2\\pi}\\sqrt{\\frac{g\\tan\\theta}{r}}$. Bu ifade salınımı açıklar.';
      const parts = TrustedAssembler.splitProseBlock(text);

      expect(parts.length).toBe(3);
      expect(parts[0]).toEqual({ kind: 'prose', text: 'Buradan frekans elde edilir:' });
      expect(parts[1]).toEqual({ kind: 'equation', latex: 'f = \\frac{1}{2\\pi}\\sqrt{\\frac{g\\tan\\theta}{r}}' });
      expect(parts[2]).toEqual({ kind: 'prose', text: 'Bu ifade salınımı açıklar.' });
    });

    it('yalnızca basit sembol ve hatırlatma içeren metinleri bölmemeli, tek bir prose olarak bırakmalıdır', () => {
      const text = 'Kütle $m$ ve açı $\\theta$ için $F = ma$ bağıntısı geçerlidir.';
      const parts = TrustedAssembler.splitProseBlock(text);

      expect(parts.length).toBe(1);
      expect(parts[0]).toEqual({ kind: 'prose', text });
    });

    it('prose bloğundaki karmaşık formülü assembleBlocks ile bağımsız ve numaralı EquationBlock haline getirmelidir', () => {
      const rawSolutionWithInlineMath: RawSolutionResponse = {
        problemTitle: 'Inline Denklem Testi',
        strategy: 'Test',
        sections: [
          {
            title: 'Türetim',
            blocks: [
              {
                kind: 'prose',
                text: 'Buradan frekans elde edilir: $f = \\frac{1}{2\\pi}\\sqrt{\\frac{g\\tan\\theta}{r}}$. Bu sonuç sistemin periyodunu belirler.'
              }
            ]
          }
        ]
      };

      const doc = TrustedAssembler.assembleSolution(dummyProblem, rawSolutionWithInlineMath);
      const blocks = doc.sections[0].blocks;

      expect(blocks.length).toBe(3);
      expect(blocks[0].kind).toBe('prose');
      expect(blocks[1].kind).toBe('equation');
      expect(blocks[2].kind).toBe('prose');

      const eqBlock = blocks[1];
      if (eqBlock.kind === 'equation') {
        expect(eqBlock.latex).toBe('f = \\frac{1}{2\\pi}\\sqrt{\\frac{g\\tan\\theta}{r}}');
        expect(eqBlock.displayNumber).toBe(1);
        expect(eqBlock.expandable).toBe(true);
      }
      expect(doc.totalEquations).toBe(1);
    });
  });

  describe('buildSolutionContext (Model Değişimi ve Bağlam Koruma)', () => {
    it('mevcut çözümün başlığını, stratejisini, kabullerini ve denklemlerini eksiksiz özetlemelidir', () => {
      const doc = TrustedAssembler.assembleSolution(dummyProblem, rawSolution);
      const targetBlock = doc.sections[1].blocks[0];
      const context = TrustedAssembler.buildSolutionContext(doc, 'Bölüm 2', targetBlock.id);

      expect(context).toContain('Test Çözüm');
      expect(context).toContain('Test stratejisi');
      expect(context).toContain('Varsayım 1');
      expect(context).toContain('Bölüm 1');
      expect(context).toContain('E = mc^2');
      expect(context).toContain('Bölüm 2 [Derinleşilen Bölüm]');
      expect(context).toContain('F = ma');
      expect(context).toContain('KULLANICININ ÇİFT TIKLAYARAK İNCELEDİĞİ HEDEF DENKLEM');
    });

    it('üst derinleşme katmanı varsa onu da bağlama dahil etmelidir', () => {
      const doc = TrustedAssembler.assembleSolution(dummyProblem, rawSolution);
      const parentLayer = {
        id: 'layer_1',
        depth: 1,
        title: 'Teğetsel İzdüşüm',
        contextualQuery: 'F_t açılımı',
        blocks: [
          { id: 'b_1', kind: 'equation' as const, latex: 'F_t = -mg\\sin\\theta', expandable: true }
        ],
        isAxiomatic: false,
        isTerminal: false
      };

      const context = TrustedAssembler.buildSolutionContext(doc, 'Bölüm 1', undefined, parentLayer);
      expect(context).toContain('Doğrudan Üst Derinleşme Katmanı: "Teğetsel İzdüşüm" (Derinlik 1)');
      expect(context).toContain('F_t açılımı');
      expect(context).toContain('F_t = -mg\\sin\\theta');
    });
  });
});


