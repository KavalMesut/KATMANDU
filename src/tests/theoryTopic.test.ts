import { describe, it, expect } from 'vitest';
import { isTheoryOrConceptTopic, TrustedAssembler } from '../domain/trustedAssembler';
import { MockProvider } from '../providers/mockProvider';
import { ProblemInput } from '../domain/types';

describe('Teorik Konu ve Kavram Atlası (Universal Scientific Theory Mode)', () => {
  it('isTheoryOrConceptTopic teorik ve kavramsal konuları doğru tespit eder', () => {
    // Teorik girdiler
    expect(
      isTheoryOrConceptTopic(
        'Genelleştirilmiş koordinatları anlat, polar, silindirik ve küresel koordinatlara uygula'
      )
    ).toBe(true);

    expect(
      isTheoryOrConceptTopic(
        'Eğrisel koordinat sistemleri ve metrik tensör dönüşümleri',
        'Koordinat Sistemleri Atlası'
      )
    ).toBe(true);

    expect(
      isTheoryOrConceptTopic('Küresel koordinatlarda hız ve ivme türetimi ders notu')
    ).toBe(true);

    expect(
      isTheoryOrConceptTopic('Lagrange mekaniğinde konfigürasyon uzayı ve genelleştirilmiş koordinatlar teorisi')
    ).toBe(true);

    // Standart sınav problemleri (teorik atlas değil)
    expect(
      isTheoryOrConceptTopic('Uzunluğu L olan basit sarkacın hareket denklemini türetiniz.')
    ).toBe(false);

    expect(
      isTheoryOrConceptTopic('Eğik düzlem üzerindeki m kütleli kamaya bağlı bloğun periyodunu bulunuz.')
    ).toBe(false);
  });

  it('MockProvider teorik istekleri getGeneralizedCoordinatesTheoryFixture ile karşılar', async () => {
    const provider = new MockProvider('tr');
    const problem: ProblemInput = {
      id: 'prob_theory_1',
      text: 'Bana genelleştirilmiş koordinatları anlat, polar, silindirik ve küresel koordinatlara uygula',
      createdAt: Date.now()
    };

    const raw = await provider.solve(problem);
    expect(raw.problemTitle).toContain('Genelleştirilmiş Koordinatlar');
    expect(raw.problemTitle).toContain('Koordinat Sistemleri');
    expect(raw.sections.length).toBeGreaterThanOrEqual(5);

    // Ana bölümlerin varlığını doğrula
    const titles = raw.sections.map((s) => s.title);
    expect(titles.some((t) => t.includes('Genelleştirilmiş Koordinatlar'))).toBe(true);
    expect(titles.some((t) => t.includes('Polar'))).toBe(true);
    expect(titles.some((t) => t.includes('Silindirik'))).toBe(true);
    expect(titles.some((t) => t.includes('Küresel'))).toBe(true);
    expect(titles.some((t) => t.includes('Doğruluk') || t.includes('İndirgeme'))).toBe(true);
  });

  it('TrustedAssembler teorik konu çıktısını kurallara uygun deterministik SolutionDocument yapar', async () => {
    const provider = new MockProvider('tr');
    const problem: ProblemInput = {
      id: 'prob_theory_2',
      text: 'Genelleştirilmiş koordinatlar ve koordinat sistemleri atlası',
      createdAt: Date.now()
    };

    const raw = await provider.solve(problem);
    const doc = TrustedAssembler.assembleSolution(problem, raw);

    expect(doc.problemTitle).toBe('Genelleştirilmiş Koordinatlar ve Eğrisel Koordinat Sistemleri Atlası');
    expect(doc.sections.length).toBeGreaterThanOrEqual(5);

    // Bütün denklemler ardışık ve numaralandırılmış olmalıdır
    const equationBlocks = doc.sections.flatMap((s) =>
      s.blocks.filter((b) => b.kind === 'equation')
    );
    expect(equationBlocks.length).toBeGreaterThanOrEqual(10);
    equationBlocks.forEach((eq, idx) => {
      if (eq.kind === 'equation') {
        expect(eq.displayNumber).toBe(idx + 1);
        expect(eq.id).toBeDefined();
        expect(typeof eq.id).toBe('string');
      }
    });

    // Doğrulama bölümü ve koordinat indirgemesi
    const verificationSec = doc.sections.find(
      (s) => s.title.includes('Doğruluk') || s.title.includes('İndirgemeleri')
    );
    expect(verificationSec).toBeDefined();
    expect(verificationSec?.title).toContain('Koordinat İndirgemeleri');

    // Sınır durum kontrolleri
    expect(doc.verification).toBeDefined();
    expect(doc.verification?.limitingCases.length).toBeGreaterThanOrEqual(2);
    const hasSphericalToPolar = doc.verification?.limitingCases.some(
      (c) => c.condition.includes('\\theta') && c.condition.includes('\\pi')
    );
    expect(hasSphericalToPolar).toBe(true);

    // İleri düzey inceleme / Christoffel sembolleri seçeneği
    expect(doc.verification?.advancedChecks).toBeDefined();
    expect(doc.verification?.advancedChecks?.some((ac) => ac.badge?.includes('Riemann'))).toBe(true);
  });
});
