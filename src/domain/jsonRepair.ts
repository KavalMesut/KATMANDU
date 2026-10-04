/**
 * jsonRepair.ts
 *
 * LLM'lerin (Gemini, GPT vb.) JSON çıktıları içinde LaTeX matematik formülleri
 * üretirken yaptığı kaçış (escape) hatalarını otomatik düzelten kurşun geçirmez yardımcı.
 *
 * Tipik hata:
 * "Bad escaped character in JSON at position ..."
 * Nedeni: \alpha, \lambda, \frac, \theta gibi LaTeX komutlarının JSON içinde
 * \\alpha, \\lambda olarak kaçış yapılmaması.
 */

import { translate } from '../i18n';

export function repairLatexEscapesInJson(input: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    // Tırnak işareti kontrolü (kaçış yapılmamış tırnaklar)
    if (char === '"' && (i === 0 || input[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
      continue;
    }

    if (inString) {
      // Dize içi gerçek satır sonu karakterleri JSON'da geçersizdir -> \n'e dönüştür
      if (char === '\n') {
        result += '\\n';
        i++;
        continue;
      }
      if (char === '\r') {
        i++;
        continue;
      }

      if (char === '\\') {
        const nextChar = input[i + 1];

        // Dize sonu
        if (nextChar === undefined) {
          result += '\\\\';
          i++;
          continue;
        }

        // Zaten kaçış yapılmış ters eğik çizgi: "\\"
        if (nextChar === '\\') {
          result += '\\\\';
          i += 2;
          continue;
        }

        // Kaçış yapılmış tırnak: "\""
        if (nextChar === '"') {
          result += '\\"';
          i += 2;
          continue;
        }

        // LaTeX komutu olabilecek durumlar (\theta, \tau, \tan, \frac, \beta, \rho, \nabla vb.)
        const rest = input.slice(i + 1, i + 15);
        const isLatexKeyword =
          /^(theta|tau|tan|times|tilde|text|to|top|frac|beta|bar|begin|bf|rho|partial|nabla|sum|int|infty|alpha|gamma|delta|epsilon|sigma|omega|phi|psi|chi|mu|nu|lambda|left|right|dots|quad|qquad|sqrt|hat|vec|dot|ddot|pm|mp|le|ge|neq|approx|sim|equiv|subset|in|notin|forall|exists|cos|sin|ln|log|exp|bold|cdot|cup|cap|circ|prod|perp|parallel)\b/i.test(
            rest
          );

        if (isLatexKeyword) {
          result += '\\\\';
          i++;
          continue;
        }

        // Geçerli unicode kaçışı: \uXXXX
        if (nextChar === 'u' && /^[0-9a-fA-F]{4}/.test(input.slice(i + 2, i + 6))) {
          result += '\\u';
          i += 2;
          continue;
        }

        // Standart JSON kontrol karakterleri (\/, \b, \f, \n, \r, \t)
        // Eğer arkasından hemen bir harf gelmiyorsa standart kontrol karakteri olarak koru
        if (['n', 'r', 't', 'b', 'f', '/'].includes(nextChar)) {
          const afterNext = input[i + 2];
          if (!afterNext || !/[a-zA-Z]/.test(afterNext)) {
            result += '\\' + nextChar;
            i += 2;
            continue;
          }
        }

        // Diğer tüm harfler (\a, \c, \d, \e, \g, \h, \l, \m, \o, \p, \s, \v, \w vb.)
        // veya semboller (\(, \), \[, \], \{, \}):
        // Bunlar JSON'da YASAKTIR ve kesinlikle LaTeX ters eğik çizgisidir!
        result += '\\\\';
        i++;
        continue;
      }
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * safeJsonParse:
 * JSON string'i önce doğrudan ayrıştırmayı dener. Eğer LLM'den kaynaklı kaçış hatası
 * ("Bad escaped character") varsa, otomatik olarak LaTeX kaçışlarını onarıp ayrıştırır.
 */
export function safeJsonParse<T>(raw: string, localize: typeof translate = translate): T {
  let clean = raw.trim();

  // Markdown codeblock (```json ... ```) temizliği
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // 1. Doğrudan deneme (en hızlı yol)
  try {
    return JSON.parse(clean) as T;
  } catch {
    // 2. LaTeX Kaçış Onarımı
    const repaired = repairLatexEscapesInJson(clean);
    try {
      return JSON.parse(repaired) as T;
    } catch {
      // 3. Son çare: Dize içi çift tırnak veya kaçış temizliği
      try {
        const fallback = repaired.replace(/\\'/g, "'");
        return JSON.parse(fallback) as T;
      } catch {
        throw new SyntaxError(localize("Model yanıtı geçerli JSON olarak okunamadı."));
      }
    }
  }
}
