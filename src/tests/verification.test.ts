import { describe, it, expect } from 'vitest';
import { MockProvider } from '../providers/mockProvider';
import { TrustedAssembler, isPureMathProblem } from '../domain/trustedAssembler';
import { exportToLaTeX } from '../domain/latexExporter';
import { ProblemInput, RawSolutionResponse } from '../domain/types';

describe('Fiziksel Sağlama: Boyut Analizi ve Limit Durumlar (Sanity Checks)', () => {
  const provider = new MockProvider('tr');

  it('Hareketli eğik düzlem (moving wedge) problemi doğru fixture ile çözülmelidir', async () => {
    const wedgeProblem: ProblemInput = {
      id: 'wedge_001',
      text: 'Sürtünmesiz yatay düzlemdeki hareketli eğik düzlem ve üzerindeki blok için ivmeleri bulunuz.',
      createdAt: Date.now()
    };

    const raw = await provider.solve(wedgeProblem);
    expect(raw.problemTitle).toContain('Hareketli Eğik Düzlem');

    const doc = TrustedAssembler.assembleSolution(wedgeProblem, raw);
    expect(doc.verification).toBeDefined();

    // 1. Boyut analizi kontrolü
    expect(doc.verification?.dimensionalAnalysis).toBeDefined();
    expect(doc.verification?.dimensionalAnalysis).toContain('[L T^{-2}]');

    // 2. Limit durumlar kontrolü
    const limits = doc.verification?.limitingCases || [];
    expect(limits.length).toBeGreaterThanOrEqual(3);

    // M -> \infty limitinde standart eğik düzlem çıkmalı: g sin\alpha
    const massInfinityCase = limits.find((lc) => lc.condition.includes('M \\to \\infty'));
    expect(massInfinityCase).toBeDefined();
    expect(massInfinityCase?.expected).toContain('g \\sin\\alpha');
    expect(massInfinityCase?.analysis).toContain('standart sabit eğik düzlem');

    // \alpha -> 0 limitinde ivme sıfır olmalı
    const angleZeroCase = limits.find((lc) => lc.condition.includes('\\alpha \\to 0'));
    expect(angleZeroCase).toBeDefined();
    expect(angleZeroCase?.expected).toContain('a_{\\text{rel}} = 0');

    // \alpha -> 90^\circ limitinde serbest düşme olmalı
    const angle90Case = limits.find((lc) => lc.condition.includes('90'));
    expect(angle90Case).toBeDefined();
    expect(angle90Case?.expected).toContain('a_{\\text{rel}} = g');
  });

  it('Basit sarkaç kanonik çözümü boyut analizi ve sınır durumları eksiksiz içermelidir', async () => {
    const pendulumProblem: ProblemInput = {
      id: 'pendulum_check',
      text: 'Basit sarkaç salınım periyodunu türetiniz.',
      createdAt: Date.now()
    };

    const raw = await provider.solve(pendulumProblem);
    const doc = TrustedAssembler.assembleSolution(pendulumProblem, raw);

    expect(doc.verification).toBeDefined();
    expect(doc.verification?.dimensionalAnalysis).toContain('[T]');

    const limits = doc.verification?.limitingCases || [];
    expect(limits.length).toBeGreaterThanOrEqual(2);

    const gZero = limits.find((lc) => lc.condition.includes('g \\to 0'));
    expect(gZero).toBeDefined();
    expect(gZero?.expected).toContain('T \\to \\infty');

    const lZero = limits.find((lc) => lc.condition.includes('L \\to 0'));
    expect(lZero).toBeDefined();
    expect(lZero?.expected).toContain('T \\to 0');
  });

  it('Modelden gelen ham verification verisi TrustedAssembler ile otomatik doğruluk bölümüne dönüştürülmelidir', () => {
    const dummyProblem: ProblemInput = {
      id: 'custom_001',
      text: 'Özel mekanik sistem',
      createdAt: Date.now()
    };

    const rawWithoutSection: RawSolutionResponse = {
      problemTitle: 'Özel Parçacık Hareketi',
      problemText: 'Hız ve konum bulunuz.',
      strategy: 'Newton denklemleri',
      sections: [
        {
          title: 'Hareket Denklemi',
          blocks: [
            { kind: 'prose', text: 'Analitik çözüm.' },
            { kind: 'equation', latex: 'v(t) = v_0 + a t' }
          ]
        }
      ],
      verification: {
        dimensionalAnalysis: 'Hız $[L T^{-1}]$ olup sağ taraf $[L T^{-1}] + [L T^{-2}][T] = [L T^{-1}]$ uyumludur.',
        limitingCases: [
          {
            condition: 't = 0',
            expected: 'v(0) = v_0',
            analysis: 'Başlangıç anında hız doğrudan başlangıç hızına eşit kalır.'
          },
          {
            condition: 'a = 0',
            expected: 'v(t) = v_0',
            analysis: 'İvmesiz ortamda parçacık sabit hızla hareket eder.'
          }
        ]
      }
    };

    const doc = TrustedAssembler.assembleSolution(dummyProblem, rawWithoutSection);

    // Sections içinde otomatik eklenen doğruluk bölümü bulunmalıdır
    const verificationSec = doc.sections.find((s) =>
      s.title.toLowerCase().includes('sağlama') || s.title.toLowerCase().includes('doğruluk')
    );
    expect(verificationSec).toBeDefined();
    expect(verificationSec?.blocks.length).toBe(3); // 1 boyut analizi + 2 limit durumu
  });

  it('LaTeX çıktısı doğruluk ve sağlama bölümlerini eksiksiz ihraç etmelidir', () => {
    const dummyProblem: ProblemInput = {
      id: 'latex_check',
      text: 'Hareketli kama problemi',
      createdAt: Date.now()
    };

    const raw = MockProvider.getMovingWedgeFixture();
    const doc = TrustedAssembler.assembleSolution(dummyProblem, raw);

    const latex = exportToLaTeX(doc);
    expect(latex).toContain('\\documentclass');
    expect(latex).toContain('Boyut Analizi');
    expect(latex).toContain('M \\to \\infty');
    expect(latex).toContain('g \\sin\\alpha');
  });

  it('Problem 7.34 (yaylı hareketli kama) için İleri Düzey Derinleştirme Sağlamaları eksiksiz üretilmelidir', async () => {
    const springWedgeProblem: ProblemInput = {
      id: 'prob_7_34',
      text: 'Problem 7.34: Yaylı hareketli kama ve bloğun küçük salınım frekansı',
      createdAt: Date.now()
    };

    const raw = await provider.solve(springWedgeProblem);
    expect(raw.problemTitle).toContain('Problem 7.34');

    const doc = TrustedAssembler.assembleSolution(springWedgeProblem, raw);
    expect(doc.verification).toBeDefined();

    // Boyut analizi ve sınır durumları kontrolü
    expect(doc.verification?.dimensionalAnalysis).toContain('[T^{-1}]');
    expect(doc.verification?.limitingCases.length).toBeGreaterThanOrEqual(3);

    // İleri Düzey Derinleştirme Sağlamaları kontrolü
    const advancedChecks = doc.verification?.advancedChecks || [];
    expect(advancedChecks.length).toBe(3);

    const consCheck = advancedChecks.find((c) => c.type === 'conservation');
    expect(consCheck).toBeDefined();
    expect(consCheck?.badge).toContain('Korunum');
    expect(consCheck?.title).toContain('Yatay Momentum');

    const altCheck = advancedChecks.find((c) => c.type === 'alternative_method');
    expect(altCheck).toBeDefined();
    expect(altCheck?.badge).toContain('Alternatif');
    expect(altCheck?.title).toContain('Newton');

    const stabCheck = advancedChecks.find((c) => c.type === 'stability');
    expect(stabCheck).toBeDefined();
    expect(stabCheck?.badge).toContain('Kararlılık');
    expect(stabCheck?.title).toContain('Potansiyel');
  });

  it('İleri Düzey Sağlama başlıkları tıklandığında analitik türetim ve ispat katmanına dallanmalıdır', async () => {
    // 1. Yatay Momentum Korunumu & Noether Teoremi İspatı
    const expCons = await provider.expand({
      problemText: 'Problem 7.34',
      parentSectionTitle: 'Doğruluk Denetimi',
      contextualInquiry: {
        selectedText: 'Yatay Momentum Korunumu & Noether Teoremi',
        userQuery: 'x koordinatının döngüsel olmasından doğan momentum korunumunu ispatlayınız.'
      },
      depth: 1,
      ancestorPath: ['Doğruluk Denetimi']
    });
    expect(expCons.title).toContain('Yatay Momentum Korunumu');
    expect(expCons.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('p_x'))).toBe(true);
    expect(expCons.isAxiomatic).toBe(true);
    expect(expCons.axiomType).toBe('physics');

    // 2. Newton & d'Alembert Eylemsizlik Kuvveti Yöntemi
    const expNewton = await provider.expand({
      problemText: 'Problem 7.34',
      parentSectionTitle: 'Doğruluk Denetimi',
      contextualInquiry: {
        selectedText: 'Newton & d\'Alembert Eylemsizlik Kuvveti Yöntemi',
        userQuery: 'd\'Alembert eylemsizlik kuvvetiyle bloğun hareket denklemini türetiniz.'
      },
      depth: 1,
      ancestorPath: ['Doğruluk Denetimi']
    });
    expect(expNewton.title).toContain('d\'Alembert');
    expect(expNewton.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('\\vec{F}_{\\text{eylemsizlik}}'))).toBe(true);
    expect(expNewton.isAxiomatic).toBe(true);

    // 3. Potansiyel Eğriliği ve Kararlılık Analizi
    const expStab = await provider.expand({
      problemText: 'Problem 7.34',
      parentSectionTitle: 'Doğruluk Denetimi',
      contextualInquiry: {
        selectedText: 'Potansiyel Eğriliği ve Kararlılık Analizi',
        userQuery: 'Potansiyel kuyusunun eğriliğini ve salınım frekansını türetiniz.'
      },
      depth: 1,
      ancestorPath: ['Doğruluk Denetimi']
    });
    expect(expStab.title).toContain('Potansiyel Enerji Eğriliği');
    expect(expStab.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('V\'\''))).toBe(true);
    expect(expStab.isAxiomatic).toBe(true);
  });

  it('Model doğruluk bölümüne sadece 1 cümlelik özet ve diyagram koyduğunda, TrustedAssembler eksik olan boyut analizini ve limit durumlarını o bölüme otomatik enjekte etmelidir', () => {
    const springWedgeProb: ProblemInput = {
      id: 'spring_wedge_live',
      text: 'Problem 7.34: Yaylı hareketli kama ve bloğun açısal frekansını bulunuz.',
      createdAt: Date.now()
    };

    // LLM'nin gerçekte ürettiği çıktı (kullanıcı ekran görüntüsündeki gibi)
    const rawWithEmptyVerificationSection: RawSolutionResponse = {
      problemTitle: 'Problem 7.34: Yaylı Hareketli Kama',
      problemText: 'Problem 7.34: Yaylı hareketli kama ve bloğun açısal frekansı',
      strategy: 'Lagrange mekaniği ve küçük salınım yaklaşımı',
      sections: [
        {
          title: 'Euler-Lagrange ve Frekans Türetimi',
          blocks: [
            { kind: 'equation', latex: '\\omega = \\sqrt{\\frac{k(M+m)}{Mm + m^2\\sin^2\\alpha}}', explanation: 'Frekans' }
          ]
        },
        {
          title: 'Çözümün Sağlaması ve Doğruluk Kontrolleri',
          blocks: [
            {
              kind: 'prose',
              text: 'Türetilen nihai açısal frekans $\\omega = \\sqrt{\\frac{k(M+m)}{Mm + m^2\\sin^2\\alpha}}$ formülünün fiziki tutarlılığı boyut analizi ve sınır durumlar incelenerek test edilmiştir.'
            },
            {
              kind: 'diagram',
              spec: {
                width: 300,
                height: 200,
                elements: [{ type: 'mass', id: 'm1', x: 50, y: 50, label: 'm' }]
              }
            }
          ]
        }
      ],
      verification: {
        dimensionalAnalysis: 'Açısal frekans $[\omega] = [T^{-1}]$ (rad/s) birimindedir. Yay sabiti $[k] = [M T^{-2}]$ olup boyutlar tam uyumludur.',
        limitingCases: [
          {
            condition: 'M \\to \\infty',
            expected: '\\omega = \\sqrt{k/m}',
            analysis: 'Kama sabitlenir ve blok sabit eğik düzlemde standart yay salınımı yapar.'
          },
          {
            condition: '\\alpha \\to 0',
            expected: '\\omega = \\sqrt{\\frac{k}{\\mu}}',
            analysis: 'Yatay eksende iki serbest kütlenin bağıl titreşimi elde edilir.'
          }
        ]
      }
    };

    const doc = TrustedAssembler.assembleSolution(springWedgeProb, rawWithEmptyVerificationSection);

    // Sağlama bölümü bulunmalı
    const vSec = doc.sections.find((s) => s.title.includes('Sağlaması'));
    expect(vSec).toBeDefined();

    // Bloklar incelenmeli: Giriş metnindeki karmaşık formül atomik olarak ayrıştırıldığı için (prose + equation + prose = 3),
    // enjekte edilen boyut analizi (1) ve 2 limit durumu (2) ile diyagram (1) eklendiğinde:
    // Toplam blok sayısı: 3 (giriş) + 1 (boyut analizi) + 2 (limit durumları) + 1 (diyagram) = 7
    expect(vSec?.blocks.length).toBe(7);

    // Boyut analizi bloğunun varlığı ve içeriği
    const dimBlock = vSec?.blocks.find((b) => b.kind === 'prose' && (b as any).text.includes('1. Boyut Analizi'));
    expect(dimBlock).toBeDefined();
    expect((dimBlock as any)?.text).toContain('[T^{-1}]');

    // Limit durumları bloklarının varlığı ve içeriği
    const limit1Block = vSec?.blocks.find((b) => b.kind === 'prose' && (b as any).text.includes('2.1 Limit Durumu'));
    expect(limit1Block).toBeDefined();
    expect((limit1Block as any)?.text).toContain('M \\to \\infty');

    const limit2Block = vSec?.blocks.find((b) => b.kind === 'prose' && (b as any).text.includes('2.2 Limit Durumu'));
    expect(limit2Block).toBeDefined();
    expect((limit2Block as any)?.text).toContain('\\alpha \\to 0');

    // Diyagramın en sonda korunup korunmadığı
    const lastBlock = vSec?.blocks[vSec.blocks.length - 1];
    expect(lastBlock?.kind).toBe('diagram');

    // İleri düzey rozetlerin de korunduğu
    expect(doc.verification?.advancedChecks).toBeDefined();
    expect(doc.verification?.advancedChecks?.length).toBeGreaterThanOrEqual(3);

    // LaTeX çıktısında hem boyut analizi hem limit durumları yer almalı
    const latex = exportToLaTeX(doc);
    expect(latex).toContain('1. Boyut Analizi');
    expect(latex).toContain('2.1 Limit Durumu');
    expect(latex).toContain('M \\to \\infty');
  });

  it('Model verification alanını boş bıraktığında başarılı sağlama sentezlenmemelidir', () => {
    const springWedgeProb: ProblemInput = {
      id: 'spring_wedge_empty_verif',
      text: 'Problem 7.34: Yaylı hareketli kama ve bloğun açısal frekansını bulunuz.',
      createdAt: Date.now()
    };

    const rawEmptyVerification: RawSolutionResponse = {
      problemTitle: 'Problem 7.34: Yaylı Hareketli Kama',
      problemText: 'Problem 7.34: Yaylı hareketli kama ve bloğun açısal frekansı',
      strategy: 'Lagrange mekaniği',
      sections: [
        {
          title: 'Euler-Lagrange Denklemi',
          blocks: [
            { kind: 'equation', latex: '\\omega = \\sqrt{\\frac{k(M+m)}{Mm + m^2\\sin^2\\alpha}}' }
          ]
        }
      ]
      // verification alanı yok!
    };

    const doc = TrustedAssembler.assembleSolution(springWedgeProb, rawEmptyVerification);

    expect(doc.verification?.assessmentSource).toBe('none');
    expect(doc.verification?.independentCheck?.status).toBe('not_checked');
    expect(doc.verification?.dimensionalAnalysis).toBeUndefined();
    expect(doc.verification?.limitingCases).toEqual([]);
    expect(doc.sections).toHaveLength(1);
    expect(exportToLaTeX(doc)).toContain('Kontrol edilmedi');

  });

  describe('Saf Matematik Ayrımı ve Boyut Analizi Muafiyeti', () => {
    it('isPureMathProblem: Fizik ve Saf Matematik problemlerini doğru ayırt etmelidir', () => {
      // Saf matematik soruları (Boyut analizi yapılmamalı)
      expect(isPureMathProblem('\\int \\frac{1}{1+x^2} dx integralini hesaplayınız.')).toBe(true);
      expect(isPureMathProblem('y\'\' + 4y = 0 diferansiyel denkleminin genel çözümünü bulunuz.')).toBe(true);
      expect(isPureMathProblem('x^3 - 5x + 6 = 0 denkleminin köklerini bulunuz.')).toBe(true);
      expect(isPureMathProblem('f(x) = \\ln(x^2 + 1) fonksiyonunun yerel ekstremumlarını bulunuz.')).toBe(true);
      expect(isPureMathProblem('Bir torbada 3 kırmızı 4 beyaz top vardır. Çekilen 2 topun aynı renk olma olasılığı nedir?')).toBe(true);
      expect(isPureMathProblem('Bu yaygın bir fonksiyondur ve integral işlemi yapılarak alan bulunur.')).toBe(true);
      expect(isPureMathProblem('Evaluate the limit \\lim_{x \\to 0} \\frac{\\sin x}{x}.')).toBe(true);

      // Fizik ve mekanik soruları (Boyut analizi yapılmalı)
      expect(isPureMathProblem('Sürtünmesiz yatay düzlemdeki hareketli eğik düzlem ve kütle ivmesini bulunuz.')).toBe(false);
      expect(isPureMathProblem('Basit sarkaç periyodu türetimi.')).toBe(false);
      expect(isPureMathProblem('Yay sabiti k olan kütle-yay sisteminin açısal frekansı.')).toBe(false);
      expect(isPureMathProblem('Bir cismin yerçekimi ivmesi g altında serbest düşme hızı.')).toBe(false);
      expect(isPureMathProblem('Elektrik devresinde R direnci üzerinden geçen akım.')).toBe(false);
    });

    it('Saf matematikte yapılmamış analitik sağlama üretilmemelidir', () => {
      const mathProblem: ProblemInput = {
        id: 'math_integral_01',
        text: 'f(x) = \\int \\frac{1}{1+x^2} dx integralini hesaplayınız.',
        createdAt: Date.now()
      };

      const rawMathSolution: RawSolutionResponse = {
        problemTitle: 'Belirsiz İntegral Hesabı',
        problemText: 'f(x) = \\int \\frac{1}{1+x^2} dx integralini hesaplayınız.',
        strategy: 'Standart trigonometrik dönüşüm veya temel anti-türev tablosu',
        sections: [
          {
            title: 'Çözüm Adımları',
            blocks: [
              { kind: 'prose', text: 'Temel integral tablosundan doğrudan arctan fonksiyonu elde edilir.' },
              { kind: 'equation', latex: 'f(x) = \\arctan(x) + C' }
            ]
          }
        ]
      };

      const doc = TrustedAssembler.assembleSolution(mathProblem, rawMathSolution);

      // 1. verification objesinde fiziksel boyut analizi olmamalı
      expect(doc.verification).toBeDefined();
      expect(doc.verification?.dimensionalAnalysis).toBeUndefined();

      expect(doc.verification?.assessmentSource).toBe('none');
      expect(doc.verification?.independentCheck?.status).toBe('not_checked');
      expect(doc.verification?.limitingCases).toEqual([]);
      expect(doc.sections).toHaveLength(1);
      const latex = exportToLaTeX(doc);
      expect(latex).not.toContain('Boyut Analizi');
      expect(latex).not.toContain('kanıtlanmıştır');
      expect(latex).toContain('Kontrol edilmedi');

    });

    it('Saf matematik probleminde model yanlışlıkla boyut analizi bloğu üretirse temizlenmelidir', () => {
      const mathProblem: ProblemInput = {
        id: 'math_diff_01',
        text: 'y\'\' + 4y = 0 diferansiyel denklemini çözünüz.',
        createdAt: Date.now()
      };

      // Modelin yanlışlıkla fiziksel boyut analizi uydurduğu senaryo
      const rawHallucinatedSolution: RawSolutionResponse = {
        problemTitle: 'İkinci Mertebeden Diferansiyel Denklem',
        problemText: 'y\'\' + 4y = 0 diferansiyel denklemini çözünüz.',
        strategy: 'Karakteristik denklem',
        sections: [
          {
            title: 'Çözümün Sağlaması ve Doğruluk Kontrolleri (Boyut Analizi & Limit Durumlar)',
            blocks: [
              {
                kind: 'prose',
                text: '**1. Boyut Analizi (Dimensional Analysis):**\n\nBoyutlar [M] ve [L] birimleri incelenmiştir.'
              },
              {
                kind: 'prose',
                text: '**2.1 Limit Durumu ($x \\to 0$):**\n- **Beklenen Davranış:** $y(0) = c_1$\n- **Matematiksel Kanıt:** Başlangıç değeri denklemi sağlar.'
              }
            ]
          }
        ],
        verification: {
          dimensionalAnalysis: 'Bu formül [L T^{-2}] boyutundadır.', // Halüsinasyon
          limitingCases: [
            { condition: 'x \\to 0', expected: 'y(0)=c_1', analysis: 'Başlangıç değeri tutarlıdır.' }
          ]
        }
      };

      const doc = TrustedAssembler.assembleSolution(mathProblem, rawHallucinatedSolution);

      // Halüsinasyon boyut analizi temizlenmiş olmalı
      expect(doc.verification?.dimensionalAnalysis).toBeUndefined();

      const vSec = doc.sections.find((s) => s.title.includes('Sağlaması'));
      expect(vSec?.title).toBe('Çözümün Sağlaması ve Doğruluk Kontrolleri (Analitik Sağlama & Özel Değerler)');
      expect(vSec?.title).not.toContain('Boyut Analizi');

      const texts = vSec?.blocks.filter((b) => b.kind === 'prose').map((b) => (b as any).text) || [];
      expect(texts.some((t) => t.includes('[M]') || t.includes('[L]'))).toBe(false);
      expect(doc.verification?.independentCheck?.status).toBe('not_checked');
      expect(doc.verification?.assessmentSource).toBe('model');
    });

    it('F = m + a gibi boyutsal olarak hatalı veya modelin sağlama üretmediği sorularda sahte kanıt üretilmemeli, durum dürüstçe unverified olarak işaretlenmelidir', () => {
      const invalidEquationProblem: ProblemInput = {
        id: 'invalid_dim_001',
        text: 'Bir cisme etki eden kuvvet F = m + a olarak verilmiştir. Hareketi inceleyiniz.',
        createdAt: Date.now()
      };

      const rawWithoutVerification: RawSolutionResponse = {
        problemTitle: 'Hatalı Dinamik Bağıntı',
        problemText: 'F = m + a bağıntısı',
        strategy: 'Doğrudan türetim',
        sections: [
          {
            title: '1. Çözüm',
            blocks: [
              { kind: 'prose', text: 'Kuvvet ifadesi verilmiştir.' },
              { kind: 'equation', latex: 'F = m + a' }
            ]
          }
        ]
        // Model verification sağlamadı!
      };

      const doc = TrustedAssembler.assembleSolution(invalidEquationProblem, rawWithoutVerification);

      // 1. Doğrulama kaynağı unverified olmalı
      expect(doc.verification).toBeDefined();
      expect(doc.verification?.source).toBe('unverified');
      expect(doc.verification?.statusMessage).toContain('Otomatik kontrol edilmedi');

      // 2. dimensionalAnalysis tanımsız veya boş olmalı, asla sahte "kanıtlanmıştır" veya "homojendir" içermemeli
      expect(doc.verification?.dimensionalAnalysis).toBeUndefined();

      // 3. Bölüm bloklarında sahte başarı iddiaları olmamalı
      const allText = doc.sections
        .flatMap((s) => s.blocks)
        .map((b) => (b.kind === 'prose' ? b.text : ''))
        .join(' ');

      expect(allText).not.toContain('boyutsal olarak homojen olduğu ve fiziksel birim tutarlılığını sağladığı kanıtlanmıştır');
      expect(allText).not.toContain('kusursuzdur');
    });

    it('Genel bir yay probleminde (Problem 7.34 olmayan) yaylı kama formülü ve M -> infinity kama limitleri üretilmemelidir', () => {
      const genericSpringProblem: ProblemInput = {
        id: 'generic_spring_001',
        text: 'Sürtünmesiz yatay düzlemde k yay sabitine sahip bir yayın ucundaki m kütlesinin basit harmonik hareketini bulunuz.',
        createdAt: Date.now()
      };

      const rawGenericSolution: RawSolutionResponse = {
        problemTitle: 'Kütle-Yay Sistemi',
        problemText: 'Yatay yaylı m kütlesi',
        strategy: 'Hooke yasası ve Newton 2. Yasası',
        sections: [
          {
            title: '1. Hareket Denklemi',
            blocks: [
              { kind: 'prose', text: 'Kuvvet denklemi kurulur.' },
              { kind: 'equation', latex: 'm \\ddot{x} + k x = 0' }
            ]
          }
        ]
        // verification alanı yok!
      };

      const doc = TrustedAssembler.assembleSolution(genericSpringProblem, rawGenericSolution);

      // Problem 7.34'ün hareketli kama formülü (k(M+m)/(Mm + m^2 sin^2\alpha)) veya M -> \infty limitleri EKLENMEMELİDİR!
      const dimAnalysis = doc.verification?.dimensionalAnalysis || '';
      expect(dimAnalysis).not.toContain('M m + m^2');
      expect(dimAnalysis).not.toContain('\\sin^2\\alpha');

      const limits = doc.verification?.limitingCases || [];
      expect(limits.some((lc) => lc.condition.includes('M \\to \\infty'))).toBe(false);
      expect(limits.some((lc) => lc.condition.includes('\\alpha \\to'))).toBe(false);
    });

    it('Model tarafından sağlanan doğrulamalar model_claim olarak etiketlenmeli ve metinde Model Açıklaması belirtilmelidir', () => {
      const dummyProblem: ProblemInput = {
        id: 'model_claim_001',
        text: 'Sarkaç testi',
        createdAt: Date.now()
      };

      const rawWithModelVerification: RawSolutionResponse = {
        problemTitle: 'Basit Sarkaç',
        strategy: 'Tork analizi',
        sections: [
          {
            title: 'Dinamik',
            blocks: [{ kind: 'equation', latex: 'T = 2\\pi \\sqrt{L/g}' }]
          },
          {
            title: 'Çözümün Sağlaması ve Doğruluk Kontrolleri (Boyut Analizi & Limit Durumlar)',
            blocks: []
          }
        ],
        verification: {
          dimensionalAnalysis: 'Periyot boyutu $[T]$ olup $[L / (L T^{-2})]^{1/2} = [T]$ sağlar.',
          limitingCases: [
            { condition: 'g \\to 0', expected: 'T \\to \\infty', analysis: 'Geri çağırıcı kuvvet yok.' }
          ]
        }
      };

      const doc = TrustedAssembler.assembleSolution(dummyProblem, rawWithModelVerification);

      expect(doc.verification?.source).toBe('model_claim');
      expect(doc.verification?.statusMessage).toBeUndefined();

      const vSec = doc.sections.find((s) => s.title.includes('Sağlaması'));
      expect(vSec).toBeDefined();

      const texts = vSec?.blocks.filter((b) => b.kind === 'prose').map((b) => (b as any).text) || [];
      expect(texts.some((t) => t.includes('Model Açıklaması'))).toBe(true);
    });
  });
});
