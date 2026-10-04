import { createTranslator, getLanguage, type Language } from '../i18n';
import { DetectedQuestionItem } from './types';

/**
 * Metin içinde birden fazla soru olup olmadığını tespit eder.
 * Desteklenen ayrımlar:
 * 1. "---" veya "===" ile ayrılmış sorular
 * 2. "Soru 1:", "Soru 2:" veya "Problem 1:", "Problem 2:" vb.
 */
export function detectMultipleQuestions(text: string): string[] {
  if (!text || !text.trim()) return [];
  const trimmed = text.trim();

  // 1. "---" veya "===" ile ayrılmış sorular
  if (trimmed.includes('---') || trimmed.includes('===')) {
    const parts = trimmed
      .split(/(?:^|\n)\s*(?:---|===)\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 2. "Soru 1:", "Soru 2:" veya "Problem 1:", "Problem 2:" ayrımı
  const questionMatches = trimmed
    .split(/(?:^|\n)\s*(?:(?:Soru|Question)\s*\d+[:.]|Problem\s*\d+[:.])/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (questionMatches.length > 1) {
    return questionMatches;
  }

  return [trimmed];
}

/** Preserve the labels of dependent parts within a single problem. */
export function buildSubpartSolutionInstruction(text: string, language: Language = getLanguage()): string {
  const translate = createTranslator(language);
  const labels = [...text.matchAll(/(?:^|\n)\s*(?:\(([a-zçğıöşü])\)|([a-zçğıöşü])[).])\s+/gim)]
    .map((match) => (match[1] || match[2]).toLocaleLowerCase('tr'));
  const distinctLabels = [...new Set(labels)];
  const detected = distinctLabels.length >= 2
    ? translate("Metinde görülen alt madde etiketleri: {0}. ", [distinctLabels.map((label) => `${label})`).join(', ')])
    : '';

  const instruction = translate("Soruda a), b), c) gibi birbirine bağlı alt maddeler varsa bunları ayrı sorulara ayırma. Çözümün \"sections\" dizisinde her alt madde için, sorudaki özgün harfiyle başlayan ayrı bir bölüm oluştur (ör. \"a) ...\", \"b) ...\"). Maddeleri sorudaki sırayla ve eksiksiz çöz; ortak verileri gerektiğinde önce açıkla. Harfleri değiştirme, atlama veya olmayan alt maddeler uydurma. Görsel/PDF'deki alt madde etiketlerini de aynı şekilde koru. Alt madde yoksa normal bölüm düzenini kullan. Her istenen nihai sonucu ilgili alt maddenin sonunda ayrı bir \"equation\" bloğunda \\boxed{...} biçiminde yaz. Birden fazla istenen büyüklük varsa her sonucu açıkça kutula. Ara işlemleri ve doğrulama/sağlama denklemlerini kutulama; sayısal değerle birlikte birimi de kutunun içinde göster.");
  return detected + translate(instruction);
}

/**
 * Görsel, PDF veya metindeki bağımsız soruları tespit etmek için LLM sistem istemi.
 */
export function buildQuestionDetectionPrompt(language: Language = getLanguage()): string {
  const translate = createTranslator(language);
  return translate(`Sen bir sınav, ders kitabı ve akademik belge soru tespit uzmanısın.
GÖREVİN: Verilen görsel, PDF veya metin içeriğini dikkatle inceleyerek bu belgede/içerikte KAÇ FARKLI BAĞIMSIZ SORU olduğunu tespit etmektir.

KRİTİK KURALLAR:
1. Tek bir soru varsa veya birbirine bağlı alt maddelerden (a, b, c şıkları) oluşan tek bir ana soru varsa, "questionCount": 1 olarak kabul et. Alt maddeleri tek soruda ve özgün sırasıyla tut.
2. Eğer sayfada/belgede birbirinden bağımsız 2 veya daha fazla soru varsa (örn. Soru 1, Soru 2, Soru 14, Soru 15 veya farklı numaralı test soruları), bunların her birini ayrı bir soru olarak listele.
3. YALNIZCA geçerli bir JSON nesnesi üret. Çıktı şu şemaya tam uymalıdır:
{
  "questionCount": 2,
  "questions": [
    {
      "questionNumber": 1,
      "title": "Soru 1: [Konu veya Kısa Başlık]",
      "summary": "Sorunun 1 cümlelik özeti",
      "instruction": "Bu dokümandaki yalnızca 1. soruyu ([Konu Başlığı]) çöz. Diğer soruları yoksay."
    },
    {
      "questionNumber": 2,
      "title": "Soru 2: [Konu veya Kısa Başlık]",
      "summary": "Sorunun 1 cümlelik özeti",
      "instruction": "Bu dokümandaki yalnızca 2. soruyu ([Konu Başlığı]) çöz. Diğer soruları yoksay."
    }
  ]
}`);
}

/**
 * Modelden dönen JSON çıktısını güvenle parse eder.
 */
export function parseDetectedQuestions(
  rawJson: unknown,
  fallbackText: string = '',
  language: Language = getLanguage()
): DetectedQuestionItem[] {
  const translate = createTranslator(language);
  if (!rawJson || typeof rawJson !== 'object') {
    return [
      {
        questionNumber: 1,
        title: 'Problem 1',
        instruction: fallbackText || translate("Problemi adım adım çöz.")
      }
    ];
  }

  const obj = rawJson as { questionCount?: number; questions?: unknown[] };
  if (Array.isArray(obj.questions) && obj.questions.length > 0) {
    const list: DetectedQuestionItem[] = [];
    for (let i = 0; i < obj.questions.length; i++) {
      const q = obj.questions[i] as Record<string, unknown>;
      const num = Number(q.questionNumber) || i + 1;
      const title = typeof q.title === 'string' && q.title.trim() ? q.title.trim() : translate("Soru {0}", [num]);
      const summary = typeof q.summary === 'string' ? q.summary.trim() : undefined;
      const instruction =
        typeof q.instruction === 'string' && q.instruction.trim()
          ? q.instruction.trim()
          : translate("Bu dokümandaki {0}. soruyu çöz.", [num]);
      const rawText = typeof q.rawText === 'string' ? q.rawText.trim() : undefined;

      list.push({
        questionNumber: num,
        title,
        summary,
        instruction,
        rawText
      });
    }
    return list;
  }

  return [
    {
      questionNumber: 1,
      title: 'Problem 1',
      instruction: fallbackText || translate("Problemi adım adım çöz.")
    }
  ];
}
