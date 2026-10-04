import { containsConcept } from '../i18n/concepts';
import { translate, createTranslator, getLanguage, type Language } from '../i18n';
import {
  ProblemInput,
  RawSolutionResponse,
  SolutionDocument,
  SolutionSection,
  SolutionBlock,
  EquationBlock,
  ProseBlock,
  RawExpansionResponse,
  ExpansionLayer,
  RawBlock,
  SolutionVerification,
  AdvancedVerificationOption,
  LimitingCase,
  SolutionMetadata,
  RecommendedPath
} from './types';

/**
 * Bölüm başlıklarındaki mükerrer numaralandırmaları (örn: "1. 1. ...", "1. ...", "Bölüm 1: ...")
 * temizler; böylece UI ve PDF çıktılarında çift numara ("1. 1.") oluşmasını engeller.
 * "2-Boyutlu Hareket" veya "3 Boyutlu Uzay" gibi meşru fiziksel/matematiksel başlıkları korur.
 */
export function cleanSectionTitle(title: string): string {
  if (!title) return '';
  let current = title.trim();
  let prev = '';

  while (current !== prev) {
    prev = current;
    current = current
      // 1. "1. Bölüm:", "Bölüm 1:", "Bölüm 1 -", "Section 1.", "Kısım 1" vb.
      .replace(/^(?:(?:\d+(?:\.\d+)*\s*)?(?:bölüm|kısım|section)\s*(?:\d+)?[\s:.-]*)/i, '')
      // 2. Çoklu seviye: "1.1.", "1.1", "1.2.3" vb.
      .replace(/^\d+(?:\.\d+)+[\.:\)]?\s*/i, '')
      // 3. Tekli seviye: "1.", "1)", "1:", "1 -", "1-"
      .replace(/^\d+(?:[\.:\)]|-(?=\s)|\s+[-–—]\s+)\s*/i, '')
      .trim();
  }

  return current || translate("Bölüm");
}

/**
 * Fiziksel kavramları, birimleri ve mekanik olguları tespit eden kurallar.
 * Bu göstergelerden biri bulunursa problem fizik/mühendislik problemi sayılır.
 */
const PHYSICS_PATTERNS = [
  // Mekanik / Dinamik
  /(?:^|[^a-zçğıöşü0-9])(kütle|kütleli|kütlesi|kütleler|mass|masses|kilogram|kg|gram)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(hız|hızı|hızlar|hızları|sürat|sürati|velocity|velocities|speed)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(m\/s|km\/h|m\/s\^2|m\/s²)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(ivme|ivmesi|ivmeler|ivmeleri|acceleration)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(kuvvet|kuvveti|kuvvetler|force|forces|newton)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(yay|yayı|yaylar|yaylı|yay sabiti|kütle-yay|spring|springs|hooke)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(sarkaç|sarkacı|sarkaçlar|pendulum|pendulums)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(kama|kaması|kamalar|wedge|wedges)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(eğik düzlem|egik duzlem|incline|inclined plane)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(yerçekim|yerçekimi|yercekimi|gravity|gravitation|kütleçekim|kutlecekim)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(sürtünme|sürtünmeli|sürtünmesiz|surtunme|friction|frictionless)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(enerji|enerjisi|kinetik enerji|potansiyel enerji|mekanik enerji|energy|joule|kalori|watt|güç)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(iş-enerji|mekanik iş)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(momentum|itme|impuls|tork|açısal momentum|acisal momentum|eylemsizlik)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(lagrange|lagrangian|hamilton|hamiltonian|euler-lagrange)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(serbest cisim|fbd|free body)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(parçacık|parcacik|particle|particles)(?:[^a-zçğıöşü0-9]|$)/i,

  // Elektromanyetizma / Devreler
  /(?:^|[^a-zçğıöşü0-9])(elektrik|manyetik|manyetizma|elektromanyetik|coulomb|volt|amper|ohm|direnç|direnc|resistor)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(bobin|indüktans|induktans|inductor|sığa|siga|kapasitör|kapasitor|capacitor)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(akım|akim|gerilim|potansiyel fark|voltaj|voltage|current)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(elektrik yükü|elektriksel yük|charge)(?:[^a-zçğıöşü0-9]|$)/i,

  // Termodinamik
  /(?:^|[^a-zçğıöşü0-9])(termodinamik|thermodynamics|sıcaklık|sicaklik|temperature|celsius|kelvin|ısı|isi|entropi|entropy|basınç|basinc|pressure|pascal)(?:[^a-zçğıöşü0-9]|$)/i,

  // Dalga / Optik / Astronomi
  /(?:^|[^a-zçğıöşü0-9])(dalga boyu|dalga boyuna|kırılma indisi|foton|fotonlar|photon|optik|optics)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(gezegen|yörünge|yorunge|planet|orbit)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(fizik|fiziksel|physics|physical)(?:[^a-zçğıöşü0-9]|$)/i
];

/**
 * Saf matematiksel kavramları tespit eden kurallar.
 */
const MATH_PATTERNS = [
  /\\(int|iint|iiint|oint|lim|sum|prod)/i,
  /(?:^|[^a-zçğıöşü0-9])(integral[a-zçğıöşü]*|integrand[a-zçğıöşü]*|antiderivative[a-zçğıöşü]*)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(türev[a-zçğıöşü]*|turev[a-zçğıöşü]*|derivative[a-zçğıöşü]*|diferansiyel[a-zçğıöşü]*|differential[a-zçğıöşü]*|ode|pde)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(limit[a-zçğıöşü]*)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(matris[a-zçğıöşü]*|matrix[a-zçğıöşü]*|determinant[a-zçğıöşü]*|özdeğer[a-zçğıöşü]*|ozdeger[a-zçğıöşü]*|özvektör[a-zçğıöşü]*|eigenvalue[a-zçğıöşü]*)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(seri[a-zçğıöşü]*|series|dizi[a-zçğıöşü]*|sequence[a-zçğıöşü]*|taylor|fourier|maclaurin)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(kalkülüs|calculus|cebir[a-zçğıöşü]*|algebra[a-zçğıöşü]*|polinom[a-zçğıöşü]*|fonksiyon[a-zçğıöşü]*|function[a-zçğıöşü]*|denklem[a-zçğıöşü]*|equation[a-zçğıöşü]*|eşitsizlik[a-zçğıöşü]*|inequality)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(kök[a-zçğıöşü]*|kok[a-zçğıöşü]*|root|roots)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(geometri[a-zçğıöşü]*|geometry[a-zçğıöşü]*|triangle|circle|tangent|area|volume|üçgen[a-zçğıöşü]*|ucgen[a-zçğıöşü]*|çember[a-zçğıöşü]*|cember[a-zçğıöşü]*|daire[a-zçğıöşü]*|teğet[a-zçğıöşü]*|kiriş[a-zçğıöşü]*|alan[a-zçğıöşü]*|hacim[a-zçğıöşü]*)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(olasıl[ıi][kğg][a-zçğıöşü]*|olası[a-zçğıöşü]*|probability|dağılım[a-zçğıöşü]*|rastgele|kombinatorik[a-zçğıöşü]*|permütasyon[a-zçğıöşü]*)(?:[^a-zçğıöşü0-9]|$)/i,
  /(?:^|[^a-zçğıöşü0-9])(ispat[a-zçğıöşü]*|kanıt[a-zçğıöşü]*|teorem[a-zçğıöşü]*|theorem|proof|lemma[a-zçğıöşü]*)(?:[^a-zçğıöşü0-9]|$)/i
];

/**
 * Problemin bir fizik/mühendislik problemi mi yoksa saf soyut matematik
 * (kalkülüs, integral, türev, diferansiyel denklem, cebir, olasılık vb.) mi olduğunu tespit eder.
 * Saf matematik problemlerinde fiziksel boyut analizi ([M], [L], [T]) yapılmaz.
 */
export function isPureMathProblem(
  problemText: string,
  problemTitle: string = '',
  strategy: string = ''
): boolean {
  const combined = `${problemText} ${problemTitle} ${strategy}`;

  // Fiziksel varlıklar, birimler veya mekanik kavramlar varsa kesinlikle fizik problemidir
  const hasPhysicsConcept = PHYSICS_PATTERNS.some((pattern) => pattern.test(combined));
  if (hasPhysicsConcept) {
    return false;
  }

  // Matematiksel kavramlar var mı?
  const hasMathConcept = MATH_PATTERNS.some((pattern) => pattern.test(combined));
  return hasMathConcept;
}

/**
 * Konunun / problemin bir sınav sorusu mu yoksa teorik konu anlatımı,
 * kavram atlası veya koordinat sistemi incelemesi mi olduğunu tespit eder.
 */
export function isTheoryOrConceptTopic(
  problemText: string,
  problemTitle: string = '',
  strategy: string = ''
): boolean {
  const combined = `${problemText} ${problemTitle} ${strategy}`.toLowerCase();
  const theoryKeywords = [
    'genelleştirilmiş koordinat',
    'genellestirilmis koordinat',
    'koordinat sistemleri',
    'koordinat atlası',
    'koordinat atlasi',
    'polar koordinat',
    'küresel koordinat',
    'kuresel koordinat',
    'silindirik koordinat',
    'konu anlatımı',
    'konu anlatimi',
    'teorik çerçeve',
    'teorik cerceve',
    'kavram incelemesi',
    'türetim atlası',
    'turetim atlasi',
    'ders notu',
    'teori atlası',
    'teori atlasi'
  ];
  return theoryKeywords.some((kw) => containsConcept(combined, kw));
}

/**
 * Trusted Assembler:
 * LLM'nin ham çıktısını alır, deterministik ve kurşun geçirmez biçimde:
 * 1. Tekil ve kararlı blok kimlikleri (block_id) atar.
 * 2. Denklemlere sıralı ve mükerrersiz (1), (2), (3)... numaralarını verir.
 * 3. Şekillerin geçerliliğini denetler ve fail-soft durumu belirler.
 * 4. Modelden gelen beklenmedik alanları güvenle normalize eder; ASLA çökme yaratmaz.
 * 5. Boyut analizi ve limit durum kontrollerini (verification) çözüme katar.
 */
export class TrustedAssembler {
  /**
   * Yeni veya farklı bir AI modeline derinleşme (expansion) çağrısı yapılırken,
   * modelin problemin ve mevcut ana çözümün tamamını, kabullerini, değişken tanımlarını
   * ve tüm çözüm adımlarını eksiksiz anlaması için zengin bir bağlam metni üretir.
   */
  public static buildSolutionContext(
    doc: SolutionDocument,
    currentSectionTitle?: string,
    targetBlockId?: string,
    parentLayer?: ExpansionLayer
  ): string {
    return buildSolutionContext(doc, currentSectionTitle, targetBlockId, parentLayer);
  }

  /**
   * Ham çözüm yanıtını SolutionDocument yapısına dönüştürür.
   */
  public static assembleSolution(
    problem: ProblemInput,
    raw: RawSolutionResponse,
    metadata?: SolutionMetadata
  ): SolutionDocument {
    const translate = createTranslator(metadata?.language ?? getLanguage());
    let equationCounter = 0;
    let blockCounter = 0;

    const sectionsRaw = Array.isArray(raw?.sections) ? raw.sections : [];
    const sections: SolutionSection[] = sectionsRaw.map((rawSec, secIdx) => {
      const sectionId = `sec_${secIdx + 1}`;
      const rawBlocks = Array.isArray(rawSec?.blocks) ? rawSec.blocks : [];
      const blocks: SolutionBlock[] = [];

      for (const rawBlock of rawBlocks) {
        const assembled = this.assembleBlocks(
          rawBlock,
          sectionId,
          () => {
            blockCounter++;
            return `${sectionId}_b${blockCounter}`;
          },
          () => {
            equationCounter++;
            return equationCounter;
          }
        );
        blocks.push(...assembled);
      }

      const rawTitle = rawSec?.title != null ? String(rawSec.title) : translate("Bölüm {0}", [secIdx + 1]);
      return {
        id: sectionId,
        title: cleanSectionTitle(rawTitle),
        blocks
      };
    });

    // Fiziksel Çözüm Doğruluk Sağlaması (Boyut Analizi, Limit Durumlar & İleri Düzey Sağlamalar)
    const effectiveProblemText = (raw?.problemText && raw.problemText.trim().length > 0)
      ? raw.problemText.trim()
      : (problem.text && problem.text.trim().length > 0)
        ? problem.text.trim()
        : '';
    const effectiveTitle = String(raw?.problemTitle || '');
    const effectiveStrategy = String(raw?.strategy || '');

    const isPureMath = isPureMathProblem(effectiveProblemText, effectiveTitle, effectiveStrategy);
    const isTheory = isTheoryOrConceptTopic(effectiveProblemText, effectiveTitle, effectiveStrategy);

    const dim = isPureMath
      ? ''
      : (raw?.verification?.dimensionalAnalysis ? String(raw.verification.dimensionalAnalysis).trim() : '');
    const cases: LimitingCase[] = Array.isArray(raw?.verification?.limitingCases)
      ? raw.verification.limitingCases
          .filter(c => c && typeof c === 'object')
          .map((c) => ({
            condition: String(c.condition || '').trim(),
            expected: String(c.expected || '').trim(),
            analysis: String(c.analysis || '').trim()
          }))
          .filter((c) => c.condition || c.expected || c.analysis)
      : [];
    let advancedChecks: AdvancedVerificationOption[] = [];

    if (raw?.verification && typeof raw.verification === 'object') {
      if (Array.isArray(raw.verification.advancedChecks) && raw.verification.advancedChecks.length > 0) {
        advancedChecks = raw.verification.advancedChecks.filter(ac => ac && typeof ac === 'object').map((ac, idx) => ({
          id: String(ac.id || `adv_check_${idx + 1}`),
          title: String(ac.title || (isPureMath ? translate("Analitik Doğrulama") : translate("İleri Düzey Doğrulama"))),
          type: (ac.type || (isPureMath ? 'alternative_method' : 'other')) as AdvancedVerificationOption['type'],
          badge: String(ac.badge || (isPureMath ? translate("🔄 Analitik Sağlama") : translate("🔍 Derinleştirme"))),
          description: String(ac.description || ''),
          query: String(ac.query || ac.title || '')
        }));
      }
    }

    if (advancedChecks.length === 0) {
      advancedChecks = suggestAdvancedChecks(isPureMath, metadata?.language ?? getLanguage());
    }

    const verification: SolutionVerification = {
      dimensionalAnalysis: dim || undefined,
      limitingCases: cases,
      advancedChecks,
      assessmentSource: dim || cases.length > 0 || sections.some(s =>
        /sağlama|doğruluk|doğrulama|boyut analizi|limit durum|verification|correctness|validation|dimensional analysis|limiting case/i.test(s.title)
      ) ? 'model' : 'none',
      independentCheck: { status: 'not_checked' }
    };

    // Compatibility with records/readers using the earlier provenance names.
    verification.source = verification.assessmentSource === 'model' ? 'model_claim' : 'unverified';
    verification.statusMessage = verification.assessmentSource === 'none'
      ? translate("Model tarafından sağlama sunulmadı (Otomatik kontrol edilmedi).")
      : undefined;

    // Sağlama ve Doğruluk Kontrolleri bölümünü denetle ve güncelle
    let verificationSec = sections.find((s) => {
      const lower = s.title.toLowerCase();
      return (
        containsConcept(lower, 'sağlama') ||
        containsConcept(lower, 'doğruluk') ||
        containsConcept(lower, 'boyut analizi') ||
        containsConcept(lower, 'limit durum') ||
        containsConcept(lower, 'analitik sağlama') ||
        containsConcept(lower, 'koordinat indirgeme') ||
        containsConcept(lower, 'sınır durum')
      );
    });

    const expectedSectionTitle = isTheory
      ? (isPureMath
          ? translate("Teorik Sağlama ve Sınır Durum İncelemeleri (Özel Değerler & İndirgemeler)")
          : translate("Doğruluk ve Limit Durum İncelemeleri (Boyut Analizi & Koordinat İndirgemeleri)"))
      : (isPureMath
          ? translate("Çözümün Sağlaması ve Doğruluk Kontrolleri (Analitik Sağlama & Özel Değerler)")
          : translate("Çözümün Sağlaması ve Doğruluk Kontrolleri (Boyut Analizi & Limit Durumlar)"));

    if (
      !verificationSec &&
      verification &&
      (verification.dimensionalAnalysis || verification.limitingCases.length > 0)
    ) {
      // Henüz bir sağlama bölümü yoksa yeni oluştur
      const secIdx = sections.length + 1;
      const sectionId = `sec_${secIdx}`;
      verificationSec = {
        id: sectionId,
        title: expectedSectionTitle,
        blocks: []
      };
      sections.push(verificationSec);
    } else if (verificationSec) {
      // Saf matematik ise ve başlıkta "Boyut Analizi" geçiyorsa düzelt
      if (
        isPureMath &&
        !isTheory &&
        (containsConcept(verificationSec.title, 'Boyut Analizi') || containsConcept(verificationSec.title, 'Boyut analizi'))
      ) {
        verificationSec.title = expectedSectionTitle;
      }
    }

    if (verificationSec && verification) {
      // Saf matematik ise modelin ürettiği yanlış fiziksel boyut analizi bloklarını temizle
      if (isPureMath) {
        verificationSec.blocks = verificationSec.blocks.filter((b) => {
          if (b.kind === 'prose') {
            const lower = b.text.toLowerCase();
            const hasHallucinatedDim =
              (containsConcept(lower, 'boyut analizi') || lower.includes('dimensional analysis')) &&
              (b.text.includes('[M') ||
                b.text.includes('[L') ||
                b.text.includes('[T') ||
                containsConcept(b.text, 'birim') ||
                b.text.includes('SI'));
            return !hasHallucinatedDim;
          }
          return true;
        });
      }

      // verificationSec içindeki mevcut blokların metinlerini topla
      const combinedBlocksText = verificationSec.blocks
        .map((b) => (b.kind === 'prose' ? b.text : b.kind === 'equation' ? b.latex : ''))
        .join('\n');

      // Gerçek bir boyut analizi içeriyor mu? (Sadece 1 cümlelik genel giriş metni olmamalı;
      // [M], [L], [T] birimleri, SI analizi veya detaylı boyut hesaplaması aranır)
      const hasActualDimensionalAnalysis =
        (containsConcept(combinedBlocksText, 'Boyut Analizi') ||
          containsConcept(combinedBlocksText, 'boyut analizi') ||
          combinedBlocksText.includes('Dimensional Analysis')) &&
        (combinedBlocksText.includes('[M') ||
          combinedBlocksText.includes('[L') ||
          combinedBlocksText.includes('[T') ||
          combinedBlocksText.includes('SI') ||
          containsConcept(combinedBlocksText, 'birim') ||
          combinedBlocksText.includes('m/s') ||
          combinedBlocksText.includes('rad/s'));

      // Gerçek limit veya özel durumları içeriyor mu? (\to, ->, \lim içermeli ve açıklama barındırmalı)
      const hasActualLimitingCases =
        (combinedBlocksText.includes('\\to') ||
          combinedBlocksText.includes('->') ||
          combinedBlocksText.includes('\\lim')) &&
        (combinedBlocksText.includes('Limit Durumu') ||
          combinedBlocksText.includes('limit durumu') ||
          containsConcept(combinedBlocksText, 'Özel Değer') ||
          containsConcept(combinedBlocksText, 'Beklenen') ||
          containsConcept(combinedBlocksText, 'beklenen'));

      const newBlocks: SolutionBlock[] = [];

      // SADECE FİZİK PROBLEMLERİNDE:
      if (!isPureMath) {
        if (!hasActualDimensionalAnalysis && verification.dimensionalAnalysis) {
          blockCounter++;
          newBlocks.push({
            id: `${verificationSec.id}_b${blockCounter}`,
            kind: 'prose',
            text: translate("**1. Boyut Analizi (Model Açıklaması):**\n\n{0}", [verification.dimensionalAnalysis])
          });
        } else if (!hasActualDimensionalAnalysis && verification.assessmentSource === 'none' && verificationSec.blocks.length === 0) {
          blockCounter++;
          newBlocks.push({
            id: `${verificationSec.id}_b${blockCounter}`,
            kind: 'prose',
            text: translate("**1. Doğruluk ve Sağlama Durumu:**\n\nBu fizik çözümü için yapay zeka modeli tarafından boyut analizi veya analitik sağlama adımı sunulmamıştır. Bağıntıların fiziksel birim tutarlılığı harici bir sembolik motor tarafından otomatik olarak denetlenmemiştir.")
          });
        }
      }

      if (!hasActualLimitingCases && verification.limitingCases.length > 0) {
        const proofTitle = translate("Modelin Sağlama Açıklaması:");
        verification.limitingCases.forEach((lc, idx) => {
          blockCounter++;
          const condText = lc.condition.startsWith('$') ? lc.condition : `$${lc.condition}$`;
          const prefix = isPureMath
            ? translate("**2.{0} Özel Değer / Limit Durumu ({1}) (Model Açıklaması):**", [idx + 1, condText])
            : translate("**2.{0} Limit Durumu ({1}) (Model Açıklaması):**", [idx + 1, condText]);
          newBlocks.push({
            id: `${verificationSec.id}_b${blockCounter}`,
            kind: 'prose',
            text: translate("{0}\n- **Beklenen Davranış:** {1}\n- **{2}** {3}", [prefix, lc.expected, proofTitle, lc.analysis])
          });
        });
      }

      if (newBlocks.length > 0) {
        const diagIdx = verificationSec.blocks.findIndex((b) => b.kind === 'diagram');
        if (diagIdx !== -1) {
          // Diyagram varsa, metinleri diyagramın hemen öncesine ekle ki diyagram incelemenin görsel kanıtı olarak sonda kalsın
          verificationSec.blocks.splice(diagIdx, 0, ...newBlocks);
        } else {
          verificationSec.blocks.push(...newBlocks);
        }
      }
    }

    // Sorunun tam metni: Model transkribe etmişse (görsel/PDF) öncelikle onu al
    // (effectiveProblemText yukarıda tanımlandı)

    // Alternatif Çözüm Yolları (2. ve 3. Yol - Zorlama Yok, İsteğe Bağlı Tavsiye)
    let recommendedPaths: RecommendedPath[] | undefined = undefined;
    if (Array.isArray(raw?.recommendedPaths) && raw.recommendedPaths.length > 0) {
      recommendedPaths = raw.recommendedPaths
        .map((rp, idx) => ({
          id: String(rp.id || `path_${idx + 2}`),
          methodName: String(rp.methodName || translate("Yol {0}", [idx + 2])),
          badge: rp.badge ? String(rp.badge) : translate("⚡ {0}. Yol", [idx + 2]),
          description: String(rp.description || ''),
          query: String(rp.query || translate("{0} ile bu problemi baştan çözünüz.", [rp.methodName || translate("Alternatif yöntem")])),
          solved: Boolean(rp.solved)
        }))
        .filter((rp) => rp.methodName.trim().length > 0);
    }

    if (!recommendedPaths || recommendedPaths.length === 0) {
      const synthesized = synthesizeContextualRecommendedPaths(
        effectiveProblemText,
        effectiveTitle,
        effectiveStrategy,
        isPureMath,
        metadata?.language ?? getLanguage()
      );
      if (synthesized && synthesized.length > 0) {
        recommendedPaths = synthesized;
      }
    }

    return {
      id: `sol_${problem.id}_${Date.now()}`,
      problemId: problem.id,
      problemTitle: String(raw?.problemTitle || translate("Bilimsel Çözüm")),
      problemText: effectiveProblemText,
      problemDiagram: raw?.problemDiagram,
      attachments: problem.attachments,
      strategy: String(raw?.strategy || ''),
      assumptions: Array.isArray(raw?.assumptions) ? raw.assumptions.map(String) : [],
      sections,
      totalEquations: equationCounter,
      verification,
      recommendedPaths,
      metadata: metadata || {
        providerName: translate("KATMANDU Bilimsel Çözüm Motoru"),
        modelName: 'Kanonik Akademik Model',
        solvedAt: problem.createdAt || Date.now()
      }
    };
  }

  /**
   * Ham genişletme (expansion) yanıtını ExpansionLayer yapısına dönüştürür.
   * Modelden gelen olası biçimsel sapmaları (sections, text, blocks) güvenle normalize eder.
   */
  public static assembleExpansionLayer(
    raw: RawExpansionResponse,
    depth: number,
    targetBlockId?: string,
    targetDisplayNumber?: number,
    contextualQuery?: string,
    parentId?: string,
    cacheKey?: string,
    language: Language = getLanguage()
  ): ExpansionLayer {
    const translate = createTranslator(language);
    let blockCounter = 0;
    let childEquationCounter = 0;

    const layerId = `layer_d${depth}_${targetBlockId || 'contextual'}_${Date.now()}`;

    // Model çıktısındaki blokları güvenle topla
    const rawBlocks: RawBlock[] = [];

    // Eğer katmana özel diyagram tanımlanmışsa başa ekle
    if (raw && raw.diagram && typeof raw.diagram === 'object') {
      rawBlocks.push({
        kind: 'diagram',
        spec: raw.diagram
      });
    }

    if (raw && Array.isArray(raw.blocks)) {
      for (const b of raw.blocks) {
        if (b && typeof b === 'object') {
          // Eğer diyagram zaten eklendiyse ve blokta da varsa mükerrerliği önle
          if (b.kind === 'diagram' && raw.diagram) continue;
          rawBlocks.push(b);
        }
      }
    } else if (raw && Array.isArray((raw as any).sections)) {
      // Model blocks yerine sections döndüyse
      for (const s of (raw as any).sections) {
        if (s && Array.isArray(s.blocks)) {
          rawBlocks.push(...s.blocks);
        }
      }
    } else if (raw && ((raw as any).text || (raw as any).explanation)) {
      // Model düz metin döndüyse
      rawBlocks.push({
        kind: 'prose',
        text: String((raw as any).explanation || (raw as any).text || '')
      });
    }

    // Eğer hiçbir blok oluşmadıysa boş kalmaması için varsayılan prose oluştur
    if (rawBlocks.length === 0) {
      rawBlocks.push({
        kind: 'prose',
        text: translate("Bu katman için ayrıntılı türetim açıklaması hazırlandı.")
      });
    }

    const blocks: SolutionBlock[] = [];
    for (const rawBlock of rawBlocks) {
      const assembled = this.assembleBlocks(
        rawBlock,
        layerId,
        () => {
          blockCounter++;
          return `${layerId}_b${blockCounter}`;
        },
        () => {
          childEquationCounter++;
          return childEquationCounter;
        }
      );
      blocks.push(...assembled);
    }

    let isAxiomatic = Boolean(raw?.isAxiomatic);
    let isTerminal = Boolean(raw?.isTerminal || isAxiomatic);

    // Epistemik Filtre: Teoremler (Pisagor Teoremi, Hipotenüs, Taylor Teoremi, Noether Teoremi vb.)
    // aksiyom DEĞİLDİR; ispatlanabilir analitik önermelerdir.
    const titleScan = `${raw?.title || ''} ${raw?.explanation || ''}`.toLowerCase();
    const isPureAxiomTitle =
      containsConcept(titleScan, 'aksiyom') ||
      containsConcept(titleScan, 'postulat') ||
      titleScan.includes('peano') ||
      containsConcept(titleScan, 'öklid 5') ||
      titleScan.includes('newton') ||
      containsConcept(titleScan, 'termodinamik');

    if (
      containsConcept(titleScan, 'pisagor') ||
      containsConcept(titleScan, 'hipotenüs') ||
      titleScan.includes('pythagor')
    ) {
      // Hipotenüs ve Pisagor bağıntısı ispatlanmış bir geometrik teoremdir, aksiyom değildir.
      isAxiomatic = false;
      isTerminal = false;
    } else if (containsConcept(titleScan, 'teorem') && !isPureAxiomTitle) {
      isAxiomatic = false;
    }

    let axiomType: 'physics' | 'mathematics' | undefined = isAxiomatic ? raw?.axiomType : undefined;
    if (isAxiomatic && !axiomType) {
      const textToScan = `${raw?.title || ''} ${raw?.explanation || ''} ${contextualQuery || ''}`.toLowerCase();
      if (
        containsConcept(textToScan, 'öklid') ||
        containsConcept(textToScan, 'geometri') ||
        containsConcept(textToScan, 'matematik') ||
        containsConcept(textToScan, 'postulat') ||
        containsConcept(textToScan, 'cebir')
      ) {
        axiomType = 'mathematics';
      } else {
        axiomType = 'physics';
      }
    }

    return {
      id: layerId,
      parentId,
      cacheKey,
      depth,
      targetBlockId,
      targetDisplayNumber,
      contextualQuery,
      title: String(raw?.title || translate("Ayrıntılı İnceleme")),
      blocks,
      isAxiomatic,
      isTerminal,
      axiomType
    };
  }

  /**
   * Bir LaTeX ifadesinin tekil bir sembol/kısa hatırlatma mı ($m$, $F=ma$),
   * yoksa ayrı bir numaralı denklem olarak verilmesi gereken karmaşık bir bağıntı mı
   * (kesir, karekök, integral, toplam vb.) olduğunu tespit eder.
   */
  public static isComplexMath(latex: string): boolean {
    const trimmed = latex.trim();
    // 1. Kesir, kök, integral, toplam, limit, matris/cases, kısmi türev, nabla vb.
    if (/\\(frac|cfrac|dfrac|sqrt|int|iint|iiint|oint|sum|prod|lim|begin|partial|nabla|over)/i.test(trimmed)) {
      return true;
    }
    // 2. Noktalı/çift noktalı türev: \dot, \ddot veya d/dt
    if (/\\(dot|ddot)|d[a-zA-Z]?\/d[a-zA-Z]/i.test(trimmed)) {
      return true;
    }
    // 3. Eşitlik içeren ve basit bir hatırlatmadan (F=ma, E=mc^2, x=0) daha karmaşık olan bağıntılar
    if (trimmed.includes('=')) {
      const [left, right] = trimmed.split('=').map((s) => s.trim());
      if (left && right) {
        if (left.length > 8 || right.length > 8 || /[+\-*\/]/.test(right) || /\{/.test(right)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Metin içinde inline ($...$) veya display ($$...$$) olarak yer alan
   * karmaşık denklemleri tespit eder ve metni 'prose' ve 'equation' parçalarına böler.
   */
  public static splitProseBlock(text: string): Array<{ kind: 'prose' | 'equation'; text?: string; latex?: string }> {
    if (!text || typeof text !== 'string') return [{ kind: 'prose', text: '' }];

    // $$...$$, \[...\], \begin{equation}...\end{equation}, $...$
    const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(?:equation|align|gather|multline)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|multline)\*?\}|\$[^\$\n]+?\$)/g;
    const parts: Array<{ kind: 'prose' | 'equation'; text?: string; latex?: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const rawMatch = match[0];
      let latex = '';
      let isDisplay = false;

      if (rawMatch.startsWith('$$')) {
        latex = rawMatch.slice(2, -2).trim();
        isDisplay = true;
      } else if (rawMatch.startsWith('\\[')) {
        latex = rawMatch.slice(2, -2).trim();
        isDisplay = true;
      } else if (rawMatch.startsWith('\\begin')) {
        latex = rawMatch
          .replace(/^\\begin\{(?:equation|align|gather|multline)\*?\}\s*/, '')
          .replace(/\s*\\end\{(?:equation|align|gather|multline)\*?\}$/, '')
          .trim();
        isDisplay = true;
      } else {
        latex = rawMatch.slice(1, -1).trim();
      }

      if (isDisplay || this.isComplexMath(latex)) {
        const beforeRaw = text.slice(lastIndex, match.index);
        const beforeClean = beforeRaw.replace(/^[.,;]\s*/, '').trim();
        if (beforeClean && beforeClean.replace(/^[.,;:\s]+$/, '').length > 0) {
          parts.push({ kind: 'prose', text: beforeClean });
        }

        parts.push({ kind: 'equation', latex });
        lastIndex = match.index + rawMatch.length;
      }
    }

    const remainderRaw = text.slice(lastIndex);
    const remainderClean = remainderRaw.replace(/^[.,;]\s*/, '').trim();
    if (remainderClean && remainderClean.replace(/^[.,;:\s]+$/, '').length > 0) {
      parts.push({ kind: 'prose', text: remainderClean });
    }

    return parts.length > 0 ? parts : [{ kind: 'prose', text: text.trim() }];
  }

  /**
   * Tekil bir rawBlock'u işler; prose içinde karmaşık denklem varsa
   * bunları parçalayarak ayrı ProseBlock ve EquationBlock'lar halinde döndürür.
   */
  public static assembleBlocks(
    rawBlock: RawBlock | any,
    _containerId: string,
    nextBlockId: () => string,
    getNextEquationNumber: () => number
  ): SolutionBlock[] {
    if (!rawBlock || typeof rawBlock !== 'object') {
      return [
        {
          id: nextBlockId(),
          kind: 'prose',
          text: String(rawBlock || '')
        }
      ];
    }

    const kind = rawBlock.kind || (rawBlock.latex ? 'equation' : rawBlock.spec ? 'diagram' : 'prose');

    if (kind === 'equation') {
      const latex = String(rawBlock.latex || rawBlock.formula || rawBlock.equation || '').trim();
      const explanation = rawBlock.explanation ? String(rawBlock.explanation).trim() : undefined;
      const eqNumber = getNextEquationNumber();
      return [
        {
          id: nextBlockId(),
          kind: 'equation',
          latex,
          explanation,
          displayNumber: eqNumber,
          expandable: true
        }
      ];
    }

    if (kind === 'diagram') {
      const spec = rawBlock.spec || rawBlock;
      const hasElements =
        spec &&
        typeof spec === 'object' &&
        Array.isArray(spec.elements) &&
        spec.elements.length > 0;

      return [
        {
          id: nextBlockId(),
          kind: 'diagram',
          spec,
          status: hasElements ? 'rendered' : 'degraded'
        }
      ];
    }

    // kind === 'prose'
    const rawText = String(rawBlock.text || rawBlock.content || rawBlock.explanation || '').trim();
    const splitted = this.splitProseBlock(rawText);

    return splitted.map((part) => {
      const blockId = nextBlockId();
      if (part.kind === 'equation' && part.latex) {
        const eqNumber = getNextEquationNumber();
        const eq: EquationBlock = {
          id: blockId,
          kind: 'equation',
          latex: part.latex,
          displayNumber: eqNumber,
          expandable: true
        };
        return eq;
      }

      const prose: ProseBlock = {
        id: blockId,
        kind: 'prose',
        text: part.text || ''
      };
      return prose;
    });
  }

  /**
   * Geriye uyumluluk için tekil blok derleyici
   */
  public static assembleBlock(
    rawBlock: RawBlock | any,
    blockId: string,
    getNextEquationNumber: () => number
  ): SolutionBlock {
    const blocks = this.assembleBlocks(rawBlock, '', () => blockId, getNextEquationNumber);
    return blocks[0];
  }
}

/**
 * Fiziksel bağlama göre derinleşme ve doğrulama rozetleri (advancedChecks) sentezler.
 * Kullanıcı bu başlıklara tıklayarak ana raporda yer almayan türetim katmanlarına ulaşır.
 */
function suggestAdvancedChecks(isPureMath: boolean, language: Language): AdvancedVerificationOption[] {
  const translate = createTranslator(language);
  return [
    {
      id: 'suggest_reverse', title: isPureMath ? translate("Ters İşlem ve Analitik İnceleme") : translate("Alternatif Yöntemle Karşılaştırma"),
      type: 'alternative_method', badge: translate("🔄 İnceleme Önerisi"),
      description: translate("Sonucu bağımsız bir yoldan inceleyin; uyuşmazlık varsa açıkça belirtin."),
      query: isPureMath
        ? translate("Bu sonuç için uygun ters işlemi veya yerine koyma kontrolünü gerçekleştiriniz. Tanım kümesini ve varsa hataları belirtiniz.")
        : translate("Bu probleme uygun alternatif bir yöntem seçerek sonucu yeniden türetiniz. Önceki sonuçla uyuşmayan adımları belirtiniz.")
    },
    {
      id: 'suggest_limits', title: translate("Sınır ve Özel Durum İncelemesi"),
      type: 'other', badge: translate("🔍 İnceleme Önerisi"),
      description: translate("Problemin koşullarına uygun sınır durumlarını belirleyip hesaplayın."),
      query: translate("Bu problem için anlamlı sınır veya özel durumları seçip hesaplayınız. Seçilen değerlerin tanım kümesinde olup olmadığını ve varsayımların geçerliliğini kontrol ediniz. Tutarsızlıkları belirtiniz.")
    },
    {
      id: 'suggest_assumptions', title: isPureMath ? translate("Tanım Kümesi ve Varsayımlar") : translate("Korunum Yasalarının Uygulanabilirliği"),
      type: isPureMath ? 'other' : 'conservation', badge: translate("📋 İnceleme Önerisi"),
      description: translate("Kullanılan varsayımları ve gerekli koşulları inceleyin."),
      query: isPureMath
        ? translate("Çözümdeki işlemlerin tanım kümesini, tekillikleri ve kullanılan teoremlerin önkoşullarını inceleyiniz. Sağlanmayan koşulları belirtiniz.")
        : translate("Bu sistemde hangi korunum yasalarının uygulanabileceğini dış kuvvetler, kısıtlar ve simetrilerden başlayarak inceleyiniz. Korunum varsa kullanıp sonucu kontrol ediniz; yoksa nedenini açıklayınız.")
    }
  ];
}

/**
 * Yeni veya farklı bir AI modeline derinleşme (expansion) çağrısı yapılırken,
 * modelin problemin ve mevcut ana çözümün tamamını, kabullerini, değişken tanımlarını
 * ve tüm çözüm adımlarını eksiksiz anlaması için zengin bir bağlam metni üretir.
 */
export function buildSolutionContext(
  doc: SolutionDocument,
  currentSectionTitle?: string,
  targetBlockId?: string,
  parentLayer?: ExpansionLayer
): string {
  if (!doc) return '';
  const translate = createTranslator(doc.metadata?.language ?? getLanguage());
  const parts: string[] = [];

  if (doc.problemTitle) {
    parts.push(translate("Problem Başlığı: {0}", [doc.problemTitle]));
  }
  if (doc.strategy) {
    parts.push(translate("Genel Çözüm Stratejisi: {0}", [doc.strategy]));
  }
  if (doc.assumptions && doc.assumptions.length > 0) {
    parts.push(translate("Varsayımlar ve Kabuller: {0}", [doc.assumptions.join('; ')]));
  }

  if (doc.sections && doc.sections.length > 0) {
    parts.push(translate("\nAna Çözüm Akışı ve Denklemleri:"));
    doc.sections.forEach((sec, idx) => {
      const secLabel = translate("Bölüm {0}", [idx + 1]);
      const isCurrent =
        Boolean(currentSectionTitle) &&
        (sec.title.trim().toLowerCase() === currentSectionTitle!.trim().toLowerCase() ||
          secLabel.toLowerCase() === currentSectionTitle!.trim().toLowerCase() ||
          (sec.title.length > 5 &&
            currentSectionTitle!.toLowerCase().includes(sec.title.toLowerCase())));
      const marker = isCurrent ? translate(" [Derinleşilen Bölüm]") : '';
      const titleSuffix = sec.title && sec.title !== translate("Bölüm") ? `: ${sec.title}` : '';
      parts.push(`- ${secLabel}${titleSuffix}${marker}`);

      sec.blocks.forEach((b) => {
        if (b.kind === 'equation') {
          const isTarget = targetBlockId && b.id === targetBlockId;
          const targetMarker = isTarget
            ? translate(" <-- [KULLANICININ ÇİFT TIKLAYARAK İNCELEDİĞİ HEDEF DENKLEM]")
            : '';
          const num = b.displayNumber ? translate(" (Denklem {0})", [b.displayNumber]) : '';
          const expl = b.explanation ? ` // ${b.explanation}` : '';
          parts.push(`    $$${b.latex}$$${num}${expl}${targetMarker}`);
        } else if (b.kind === 'prose') {
          const textClean = b.text.trim();
          const preview = textClean.length > 280 ? textClean.slice(0, 280) + '...' : textClean;
          parts.push(translate("    Metin: {0}", [preview]));
        }
      });
    });
  }

  if (parentLayer) {
    parts.push(
      translate("\nDoğrudan Üst Derinleşme Katmanı: \"{0}\" (Derinlik {1})", [parentLayer.title, parentLayer.depth])
    );
    if (parentLayer.contextualQuery) {
      parts.push(`  Sorgu / Odak: ${parentLayer.contextualQuery}`);
    }
    parentLayer.blocks.forEach((b) => {
      if (b.kind === 'equation') {
        const isTarget = targetBlockId && b.id === targetBlockId;
        const targetMarker = isTarget ? ' <-- [HEDEF DENKLEM]' : '';
        const expl = b.explanation ? ` // ${b.explanation}` : '';
        parts.push(`    $$${b.latex}$$${expl}${targetMarker}`);
      } else if (b.kind === 'prose') {
        parts.push(translate("    Metin: {0}", [b.text.slice(0, 200)]));
      }
    });
  }

  return parts.join('\n');
}


export function synthesizeContextualRecommendedPaths(
  problemText: string,
  problemTitle: string,
  strategy: string,
  isPureMath: boolean = false,
  language: Language = getLanguage()
): RecommendedPath[] | undefined {
  const translate = createTranslator(language);
  const combined = `${problemText} ${problemTitle} ${strategy}`.toLowerCase();

  // Saf matematik problemleri
  if (isPureMath) {
    if (
      combined.includes('integral') ||
      combined.includes('antiderivative') ||
      combined.includes('\\int')
    ) {
      return [
        {
          id: 'path_math_2',
          methodName: translate("Feynman Parametrik Türev Alma Yolu (Leibniz Kuralı)"),
          badge: translate("⚡ 2. Yol: Feynman Yöntemi"),
          description:
            translate("İntegrand içine yapay bir parametre eklenerek integral işareti altında türev alma ve diferansiyel denklem çözme yöntemi."),
          query:
            translate("Bu integrali Feynman parametrik türev alma tekniği (integral işareti altında türev) kullanarak bağımsız bir 2. yol olarak baştan çözünüz."),
          solved: false
        }
      ];
    }
    return undefined;
  }

  // Fizik problemleri:
  const isLagrangeUsed =
    combined.includes('lagrang') ||
    combined.includes('euler-lagrange') ||
    combined.includes('hamilton');
  const isNewtonUsed =
    combined.includes('newton') ||
    combined.includes("d'alembert") ||
    combined.includes('fbd') ||
    containsConcept(combined, 'serbest cisim');

  if (isLagrangeUsed && !isNewtonUsed) {
    return [
      {
        id: 'path_physics_2',
        methodName: translate("Newton / d'Alembert Dinamiği (Vektörel Yaklaşım)"),
        badge: translate("⚡ 2. Yol: Vektörel Dinamik"),
        description:
          translate("Serbest cisim diyagramı (FBD), bileşenlere ayırma ve d'Alembert eylemsizlik kuvvetleriyle bağımsız doğrudan Newton denklemleri türetimi."),
        query:
          translate("Bu mekanik sistemin hareket denklemlerini Newton dinamiği, serbest cisim diyagramı ve eylemsizlik kuvvetleri kullanarak bağımsız bir 2. yol olarak baştan türetiniz."),
        solved: false
      }
    ];
  }

  if (isNewtonUsed && !isLagrangeUsed) {
    return [
      {
        id: 'path_physics_2',
        methodName: translate("Lagrange Mekaniği (Analitik Yaklaşım)"),
        badge: translate("⚡ 2. Yol: Analitik Mekanik"),
        description:
          translate("Genelleştirilmiş koordinatlar, kinetik ve potansiyel enerjiler üzerinden Euler-Lagrange varyasyonel denklemleri türetimi."),
        query:
          translate("Bu mekanik sistemin hareket denklemlerini genelleştirilmiş koordinatlar ve Euler-Lagrange denklemleri kullanarak analitik mekanik yoluyla baştan türetiniz."),
        solved: false
      }
    ];
  }

  return undefined;
}

