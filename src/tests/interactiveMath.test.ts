import { describe, it, expect } from 'vitest';
import { isSingleMathSymbol, getSymbolMeaning } from '../components/KaTeXRenderer';
import { MockProvider } from '../providers/mockProvider';

describe('Interactive Math, Symbols and General Inquiry', () => {
  const provider = new MockProvider('tr');

  describe('isSingleMathSymbol and getSymbolMeaning', () => {
    it('accurately detects single math symbols and parameters', () => {
      expect(isSingleMathSymbol('R')).toBe(true);
      expect(isSingleMathSymbol('r')).toBe(true);
      expect(isSingleMathSymbol('\\lambda')).toBe(true);
      expect(isSingleMathSymbol('\\theta')).toBe(true);
      expect(isSingleMathSymbol('m')).toBe(true);
      expect(isSingleMathSymbol('L')).toBe(true);
      expect(isSingleMathSymbol('g')).toBe(true);
      expect(isSingleMathSymbol('t_1')).toBe(true);
      expect(isSingleMathSymbol('\\omega')).toBe(true);

      // Complex expressions should NOT be single symbols
      expect(isSingleMathSymbol('m \\vec{a} = \\vec{F}')).toBe(false);
      expect(isSingleMathSymbol('\\frac{d^2\\theta}{dt^2}')).toBe(false);
      expect(isSingleMathSymbol('a^2 + b^2 = c^2')).toBe(false);
    });

    it('returns appropriate meanings for common symbols', () => {
      expect(getSymbolMeaning('R')?.toLowerCase()).toContain('direnç');
      expect(getSymbolMeaning('\\lambda')?.toLowerCase()).toContain('dalga boyu');
      expect(getSymbolMeaning('lambda')?.toLowerCase()).toContain('dalga boyu');
      expect(getSymbolMeaning('\\theta')?.toLowerCase()).toContain('açı');
      expect(getSymbolMeaning('m')?.toLowerCase()).toContain('kütle');
      expect(getSymbolMeaning('L')?.toLowerCase()).toContain('uzunluk');
      expect(getSymbolMeaning('g')?.toLowerCase()).toContain('yerçekimi');
      expect(getSymbolMeaning('\\omega')?.toLowerCase()).toContain('frekans');
      expect(getSymbolMeaning('k')?.toLowerCase()).toContain('yay sabiti');
      expect(getSymbolMeaning('T')?.toLowerCase()).toContain('periyod');
    });

    it('contextually disambiguates L based on problem domain (no multiple choice / slashes)', () => {
      // 1. Sarkaç / İp bağlamı -> Kesinlikle İp Uzunluğu
      const pendulumL = getSymbolMeaning('L', 'Basit sarkaçta tavana asılı L uzunluğunda kütlesiz ip');
      expect(pendulumL).toBe('İp Uzunluğu (L)');
      expect(pendulumL).not.toContain('/');
      expect(pendulumL).not.toContain('veya');
      expect(pendulumL).not.toContain('ya da');

      // 2. Devre / Bobin bağlamı -> Kesinlikle Bobin İndüktansı
      const circuitL = getSymbolMeaning('L', 'RLC devresinde L indüktanslı bobin ve C sığalı kapasitör');
      expect(circuitL).toBe('Bobin İndüktansı (L)');
      expect(circuitL).not.toContain('/');
      expect(circuitL).not.toContain('veya');

      // 3. Lagrangian bağlamı -> Kesinlikle Lagrangian Fonksiyonu
      const lagrangeL = getSymbolMeaning('L', 'Analitik mekanikte Lagrangian fonksiyonu L = T - V');
      expect(lagrangeL).toBe('Lagrangian Fonksiyonu (L = T - V)');
      expect(lagrangeL).not.toContain('/');
      expect(lagrangeL).not.toContain('veya');
    });

    it('contextually disambiguates R and T without multiple-choice slashes', () => {
      // R: Devre vs Yarıçap
      expect(getSymbolMeaning('R', 'Devredeki R direnci üzerinden geçen I akımı')).toBe('Elektriksel Direnç (R)');
      expect(getSymbolMeaning('R', 'Dairesel yörüngede R yarıçaplı dairesel hareket')).toBe('Yörünge Yarıçapı (R)');

      // T: Salınım periyodu vs İp gerilmesi vs Sıcaklık
      expect(getSymbolMeaning('T', 'Basit sarkacın salınım periyodu T = 2pi sqrt(L/g)')).toBe('Salınım Periyodu (T)');
      expect(getSymbolMeaning('T', 'İpteki dinamik gerilme kuvveti T')).toBe('İp Gerilme Kuvveti (T)');
      expect(getSymbolMeaning('T', 'İdeal gaz termodinamik sıcaklık T Kelvin')).toBe('Mutlak Sıcaklık (T)');
    });

    it('accurately identifies R_L and load resistance without generic labels', () => {
      expect(isSingleMathSymbol('R_L')).toBe(true);
      expect(isSingleMathSymbol('R_{load}')).toBe(true);
      expect(getSymbolMeaning('R_L')).toContain('Yük Direnci');
      expect(getSymbolMeaning('R_{load}')).toContain('Yük Direnci');
      expect(getSymbolMeaning('R_load')).toContain('Yük Direnci');
    });

    it('never returns the generic string "matematiksel ifade" for any formula or symbol', () => {
      const samples = [
        'R_L',
        'R_1',
        'V_{in}',
        'V_{out}',
        'F_{net}',
        '\\omega_0',
        'F = ma',
        'V = IR',
        'E = mc^2',
        'P = I^2 R',
        '\\frac{d^2\\theta}{dt^2}',
        '\\int f(x) dx',
        '\\vec{E}',
        'unknown_custom_symbol'
      ];

      for (const sample of samples) {
        const meaning = getSymbolMeaning(sample);
        expect(meaning?.toLowerCase()).not.toContain('matematiksel ifade');
        expect(meaning?.length).toBeGreaterThan(3);
      }
    });
  });

  describe('MockProvider Single Symbol Inquiries', () => {
    it('explains R_L with load resistance, maximum power transfer theorem and circuit diagram', async () => {
      const res = await provider.expand({
        problemText: 'Devrede yük direnci analizi',
        parentSectionTitle: 'Devre Analizi',
        depth: 1,
        ancestorPath: ['Ana Çözüm'],
        contextualInquiry: {
          selectedText: 'R_L',
          userQuery: 'R_L yük direnci nedir ve maksimum güç nasıl aktarılır?'
        }
      });

      expect(res.title).toContain('Yük Direnci');
      expect(res.explanation).toContain('Yük Direnci');
      expect(res.diagram).toBeDefined();
      // Devre şemasında resistor ve source bulunmalı
      expect(res.diagram?.elements.some((el) => el.type === 'resistor')).toBe(true);
      expect(res.diagram?.elements.some((el) => el.type === 'source')).toBe(true);
      expect(res.diagram?.elements.some((el) => el.type === 'ground')).toBe(true);

      // Maksimum güç aktarım teoremi blokları
      expect(res.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('R_s + R_L'))).toBe(true);
      expect(res.blocks.some((b) => b.kind === 'prose' && b.text.includes('Maksimum Güç'))).toBe(true);
    });

    it('explains single symbol R with units, governing formula and diagram', async () => {
      const res = await provider.expand({
        problemText: 'Basit sarkaç hareketi',
        parentSectionTitle: 'Kuvvet Analizi',
        depth: 1,
        ancestorPath: ['Ana Çözüm'],
        contextualInquiry: {
          selectedText: 'R',
          userQuery: 'R sembolü bu problemde neyi temsil eder?'
        }
      });

      expect(res.title).toContain('Sembol Analizi: $R$');
      expect(res.explanation).toContain('Yarıçap');
      expect(res.diagram).toBeDefined();
      expect(res.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('R'))).toBe(true);
      expect(res.blocks.some((b) => b.kind === 'prose' && b.text.includes('Metre'))).toBe(true);
    });

    it('explains single symbol \\lambda with units and meaning', async () => {
      const res = await provider.expand({
        problemText: 'Kısıtlı sarkaç hareketi',
        parentSectionTitle: 'Dinamik',
        depth: 1,
        ancestorPath: ['Ana Çözüm'],
        contextualInquiry: {
          selectedText: '\\lambda',
          userQuery: '\\lambda sembolü neyi temsil eder?'
        }
      });

      expect(res.title).toContain('\\lambda');
      expect(res.explanation).toContain('Lagrange');
      expect(res.diagram).toBeDefined();
      expect(res.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('\\lambda'))).toBe(true);
    });

    it('explains single symbol L in pendulum problem strictly as string length without slashes', async () => {
      const res = await provider.expand({
        problemText: 'Basit sarkaçta L boyundaki ipin hareketi',
        parentSectionTitle: 'Dinamik Hareket Denklemi',
        depth: 1,
        ancestorPath: ['Ana Çözüm'],
        contextualInquiry: {
          selectedText: 'L',
          userQuery: 'L sembolü bu problemde neyi temsil eder?'
        }
      });

      expect(res.title).toBe('Sembol Analizi: $L$ (İp Uzunluğu)');
      expect(res.explanation).toContain('İp Uzunluğu');
      expect(res.explanation).not.toContain('/');
      expect(res.explanation).not.toContain('indüktans');
      expect(res.explanation).not.toContain('lagrangian');
      expect(res.diagram).toBeDefined();
      expect(res.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('s = L \\theta'))).toBe(true);
      expect(res.blocks.some((b) => b.kind === 'prose' && b.text.includes('Metre'))).toBe(true);
    });

    it('explains single symbol L in circuit problem strictly as coil inductance', async () => {
      const res = await provider.expand({
        problemText: 'RLC devresinde L indüktanslı bobin üzerinden geçen akım',
        parentSectionTitle: 'Devre Analizi',
        depth: 1,
        ancestorPath: ['Ana Çözüm'],
        contextualInquiry: {
          selectedText: 'L',
          userQuery: 'L sembolü bu devrede neyi temsil eder?'
        }
      });

      expect(res.title).toBe('Sembol Analizi: $L$ (Bobin İndüktansı)');
      expect(res.explanation).toContain('Bobin Öz İndüktansı');
      expect(res.explanation).not.toContain('İp');
      expect(res.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('V_L = L'))).toBe(true);
      expect(res.blocks.some((b) => b.kind === 'prose' && b.text.includes('Henry'))).toBe(true);
    });

    it('explains single symbol \\theta with units and meaning', async () => {
      const res = await provider.expand({
        problemText: 'Sarkaç',
        parentSectionTitle: 'Kinematik',
        depth: 1,
        ancestorPath: ['Ana Çözüm'],
        contextualInquiry: {
          selectedText: '\\theta',
          userQuery: '\\theta açısı nedir?'
        }
      });

      expect(res.title).toContain('\\theta');
      expect(res.blocks.some((b) => b.kind === 'prose' && b.text.includes('Radyan'))).toBe(true);
    });
  });

  describe('MockProvider General Inquiry (Bottom Box)', () => {
    it('answers general inquiry regarding overall solution framework and alternative methods', async () => {
      const res = await provider.expand({
        problemText: 'Basit sarkaç hareketi',
        parentSectionTitle: 'Ana Çözüm',
        depth: 1,
        ancestorPath: ['Ana Çözüm'],
        contextualInquiry: {
          selectedText: 'Genel Problem ve Çözüm Çerçevesi',
          userQuery: 'Bu problemi Lagrange mekaniği veya mekanik enerji korunumu ile nasıl çözerdik?'
        }
      });

      expect(res.title).toContain('Genel Çözüm ve Modelleme Çerçevesi');
      expect(res.diagram).toBeDefined();
      expect(res.blocks.some((b) => b.kind === 'prose' && b.text.includes('Enerji Korunumu'))).toBe(true);
      expect(res.blocks.some((b) => b.kind === 'equation' && 'latex' in b && b.latex.includes('E = \\frac{1}{2}m L^2'))).toBe(true);
    });
  });
});
