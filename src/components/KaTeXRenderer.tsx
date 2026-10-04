import { containsConcept } from '../i18n/concepts';
import { useLanguage } from '../i18n/react';
import { translate } from '../i18n';
import React, { useMemo, useContext, createContext } from 'react';
import katex from 'katex';
import { normalizeInlineMath } from '../domain/inlineMath';

export interface KaTeXRendererProps {
  content?: string | null;
  block?: boolean;
  className?: string;
  contextText?: string;
  onFormulaClick?: (formula: string, isSingleSymbol: boolean) => void;
}

/**
 * Çözümün metin bağlamını (problem ifadesi, başlıklar, varsayımlar)
 * tüm alt bileşenlere ve formüllere aktaran bağlamsal React Context'i.
 */
export const MathExplanationContext = createContext<string>('');

/**
 * Belirli bir sembolün bağlamdan bağımsız en temel karşılığı
 */
export const COMMON_SYMBOL_MEANINGS: Record<string, string> = {
  // Elektrik & Elektronik
  R: 'Elektriksel Direnç (R)',
  R_L: 'Yük Direnci (Load Resistance) - Devreden faydalı güç çeken yük elemanı',
  'R_{L}': 'Yük Direnci (Load Resistance)',
  'R_{load}': 'Yük Direnci (Load Resistance)',
  R_load: 'Yük Direnci (Load Resistance)',
  R_s: 'Kaynak İç Direnci (Source Resistance)',
  'R_{s}': 'Kaynak İç Direnci (Source Resistance)',
  'R_{th}': 'Thevenin Eşdeğer Direnci',
  'R_{N}': 'Norton Eşdeğer Direnci',
  R_1: '1. Devre Direnci',
  R_2: '2. Devre Direnci',
  R_3: '3. Devre Direnci',
  V: 'Elektriksel Gerilim (V)',
  V_L: 'Yük Gerilimi (Load Voltage)',
  'V_{in}': 'Giriş Gerilimi (Input Voltage)',
  'V_{out}': 'Çıkış Gerilimi (Output Voltage)',
  'V_{th}': 'Thevenin Açık Devre Gerilimi',
  I: 'Elektrik Akımı (I)',
  I_L: 'Yük Akımı (Load Current)',
  'I_{sc}': 'Kısa Devre Akımı (Short-Circuit Current)',
  'I_C': 'Kolektör Akımı',
  'I_B': 'Baz Akımı',
  'I_E': 'Emiter Akımı',
  C: 'Kapasitör Sığası (C)',
  C_1: '1. Kapasitör Sığası',
  'Z_{in}': 'Giriş Empedansı',
  'Z_{out}': 'Çıkış Empedansı',
  P: 'Elektriksel Güç (P)',
  P_L: 'Yük Üzerinde Harcanan Güç',
  'P_{max}': 'Maksimum Güç Transferi',

  // Mekanik, Dinamik & Kuvvetler
  F: 'Kuvvet Vektörü (F)',
  '\\vec{F}': 'Kuvvet Vektörü (F)',
  F_net: 'Net Bileşke Kuvvet',
  'F_{net}': 'Net Bileşke Kuvvet',
  '\\vec{F}_{net}': 'Net Bileşke Kuvvet Vektörü',
  F_g: 'Yerçekimi Kuvveti (Ağırlık = mg)',
  'F_{g}': 'Yerçekimi Kuvveti (Ağırlık = mg)',
  F_N: 'Yüzey Normal Tepki Kuvveti',
  'F_{N}': 'Yüzey Normal Tepki Kuvveti',
  f_s: 'Statik Sürtünme Kuvveti',
  'f_{s}': 'Statik Sürtünme Kuvveti',
  f_k: 'Kinetik Sürtünme Kuvveti',
  'f_{k}': 'Kinetik Sürtünme Kuvveti',
  '\\mu': 'Sürtünme Katsayısı (μ)',
  mu: 'Sürtünme Katsayısı (μ)',
  '\\mu_s': 'Statik Sürtünme Katsayısı',
  '\\mu_k': 'Kinetik Sürtünme Katsayısı',
  m: 'Kütle (m)',
  m_1: '1. Cismin Kütlesi',
  m_2: '2. Cismin Kütlesi',
  a: 'Çizgisel İvme (a)',
  v: 'Çizgisel Hız (v)',
  v_0: 'İlk Hız (Başlangıç Hızı)',
  x_0: 'İlk Konum',
  p: 'Doğrusal Momentum (p)',
  '\\vec{p}': 'Doğrusal Momentum Vektörü',
  '\\vec{L}': 'Açısal Momentum Vektörü',
  L: 'Uzunluk (L)',
  g: 'Yerçekimi İvmesi (~9.81 m/s²)',
  T: 'Salınım Periyodu (T)',
  t: 'Zaman Parametresi (t)',
  k: 'Yay Sabiti (k)',
  'k_B': 'Boltzmann Sabiti (~1.38×10⁻²³ J/K)',

  // Enerji & Termodinamik
  E: 'Toplam Mekanik Enerji (E)',
  E_k: 'Kinetik Enerji',
  'E_{k}': 'Kinetik Enerji',
  E_p: 'Potansiyel Enerji',
  'E_{p}': 'Potansiyel Enerji',
  'E_{m}': 'Toplam Mekanik Enerji',
  '\\mathcal{L}': 'Lagrangian Fonksiyonu (L = T - V)',
  '\\mathcal{H}': 'Hamiltonian Fonksiyonu (Toplam Enerji)',

  // Salınım, Dalga & Açısal Büyüklükler
  '\\theta': 'Açısal Konum (θ)',
  theta: 'Açısal Konum (θ)',
  '\\theta(t)': 'Zamana Bağlı Açısal Konum',
  '\\dot{\\theta}': 'Açısal Hız (dθ/dt = ω)',
  '\\ddot{\\theta}': 'Açısal İvme (d²θ/dt² = α)',
  '\\omega': 'Açısal Frekans (ω)',
  omega: 'Açısal Frekans (ω)',
  '\\omega_0': 'Sistemin Doğal Açısal Frekansı',
  '\\alpha': 'Açısal İvme (α)',
  alpha: 'Açısal İvme (α)',
  '\\lambda': 'Dalga Boyu (λ)',
  lambda: 'Dalga Boyu (λ)',
  '\\lambda_{max}': 'Maksimum Işıma Dalga Boyu',
  '\\tau': 'Tork (τ)',
  tau: 'Tork (τ)',
  '\\phi': 'Faz Açısı (φ)',
  phi: 'Faz Açısı (φ)',
  '\\rho': 'Hacimsel Özkütle (ρ)',
  rho: 'Hacimsel Özkütle (ρ)',
  '\\sigma': 'Yüzey Gerilimi (σ)',
  sigma: 'Yüzey Gerilimi (σ)'
};

/**
 * Bir ifadenin tekil veya indisli bir fiziksel sembol/parametre olup olmadığını tespit eder
 */
export function isSingleMathSymbol(expr: string): boolean {
  const cleaned = expr.replace(/[{}]/g, '').trim();
  // Örn: R, R_L, R_load, \theta, \omega_0, \vec{F}, \dot{\theta}, m_1
  return /^(?:\\vec\{[a-zA-Z]+\}|\\dot\{[a-zA-Z\\]+\}|\\ddot\{[a-zA-Z\\]+\}|[a-zA-Z]|\\[a-zA-Z]+)(?:_[0-9a-zA-Z]+)?$/.test(cleaned);
}

/**
 * Taban sembol ve indis ayrıştırma sözlükleri
 */
const BASE_NAMES: Record<string, string> = {
  R: 'Direnç',
  r: 'Yarıçap',
  V: 'Gerilim',
  v: 'Hız',
  I: 'Elektrik Akımı',
  i: 'Akım',
  C: 'Kapasitör Sığası',
  L: 'İndüktans',
  P: 'Güç',
  F: 'Kuvvet',
  f: 'Kuvvet',
  E: 'Enerji',
  B: 'Manyetik Alan',
  T: 'Periyot',
  t: 'Zaman',
  m: 'Kütle',
  a: 'İvme',
  q: 'Elektriksel Yük',
  Q: 'Elektriksel Yük',
  k: 'Yay Sabiti',
  '\\omega': 'Açısal Frekans',
  omega: 'Açısal Frekans',
  '\\theta': 'Açısal Konum',
  theta: 'Açısal Konum',
  '\\tau': 'Zaman Sabiti',
  tau: 'Zaman Sabiti',
  '\\lambda': 'Dalga Boyu',
  lambda: 'Dalga Boyu'
};

const SUBSCRIPT_NAMES: Record<string, string> = {
  L: 'Yük (Load)',
  load: 'Yük (Load)',
  yuk: 'Yük (Load)',
  s: 'Kaynak (Source)',
  source: 'Kaynak (Source)',
  kaynak: 'Kaynak (Source)',
  in: 'Giriş (Input)',
  giris: 'Giriş (Input)',
  out: 'Çıkış (Output)',
  cikis: 'Çıkış (Output)',
  th: 'Thevenin',
  thevenin: 'Thevenin',
  N: 'Norton',
  norton: 'Norton',
  eq: 'Eşdeğer',
  es: 'Eşdeğer',
  esdeger: 'Eşdeğer',
  net: 'Net',
  toplam: 'Toplam',
  max: 'Maksimum',
  min: 'Minimum',
  avg: 'Ortalama',
  ort: 'Ortalama',
  rms: 'Etkin (RMS)',
  k: 'Kinetik',
  kin: 'Kinetik',
  p: 'Potansiyel',
  pot: 'Potansiyel',
  g: 'Yerçekimi',
  grav: 'Yerçekimi',
  c: 'Merkezcil',
  b: 'Baz',
  e: 'Emiter',
  '0': 'Başlangıç',
  '1': '1. Eleman',
  '2': '2. Eleman',
  '3': '3. Eleman'
};

/**
 * Bilinen temel kanunlar ve formüller
 */
const FAMOUS_FORMULAS: Array<{ match: RegExp; name: string }> = [
  { match: /F\s*=\s*m\s*a/i, name: "Newton'un 2. Hareket Yasası (F = ma)" },
  { match: /V\s*=\s*I\s*R/i, name: "Ohm Yasası (V = I·R)" },
  { match: /P\s*=\s*I\^?2\s*R/i, name: "Joule Isınma / Elektriksel Güç Bağıntısı (P = I²R)" },
  { match: /P\s*=\s*I\s*V/i, name: "Elektriksel Güç Bağıntısı (P = I·V)" },
  { match: /E\s*=\s*m\s*c\^?2/i, name: "Kütle-Enerji Eşdeğerliği (E = mc²)" },
  { match: /sin\s*\\?theta\s*\\approx\s*\\?theta/i, name: "Küçük Açılar Yaklaşımı (sinθ ≈ θ)" },
  { match: /\\omega\s*=\s*\\sqrt\{\s*g\s*\/\s*L\s*\}/i, name: "Basit Sarkaç Doğal Frekansı (ω = √(g/L))" },
  { match: /\\omega\s*=\s*\\sqrt\{\s*k\s*\/\s*m\s*\}/i, name: "Yaylı Harmonik Osilatör Doğal Frekansı (ω = √(k/m))" },
  { match: /T\s*=\s*2\s*\\pi\s*\\sqrt\{\s*L\s*\/\s*g\s*\}/i, name: "Basit Sarkaç Salınım Periyodu (T = 2π√(L/g))" },
  { match: /a\^?2\s*\+\s*b\^?2\s*=\s*c\^?2/i, name: "Pisagor Teoremi (a² + b² = c²)" },
  { match: /E\s*=\s*T\s*\+\s*V/i, name: "Toplam Mekanik Enerji Fonksiyonu (E = T + V)" },
  { match: /\\mathcal\{L\}\s*=\s*T\s*-\s*V/i, name: "Lagrangian Fonksiyonu (L = T - V)" },
  { match: /\\lambda\s*=\s*v\s*\/\s*f/i, name: "Dalga Boyu - Frekans Bağıntısı (λ = v/f)" }
];

/**
 * Metin bağlamından (problem ifadesi, strateji, varsayımlar)
 * sembolün çözümdeki KESİN ve TEKİL anlamını türeten akıllı çözümleyici.
 * Asla "ip uzunluğu/indüktans ya da lagrangian" gibi çoktan seçmeli seçenekler sunmaz;
 * çözümde ne olarak kullanılmışsa onu söyler.
 */
export function disambiguateSymbol(cleaned: string, contextText?: string): string | null {
  if (!contextText) return null;
  const ctx = contextText.toLowerCase();

  // L Sembolü
  if (cleaned === 'L') {
    if (containsConcept(ctx, 'sarkaç') || containsConcept(ctx, 'ip') || containsConcept(ctx, 'asılı') || containsConcept(ctx, 'sallan')) {
      return translate("İp Uzunluğu (L)");
    }
    if (containsConcept(ctx, 'çubuk') || containsConcept(ctx, 'kol') || containsConcept(ctx, 'kiriş') || containsConcept(ctx, 'mil')) {
      return translate("Çubuk Uzunluğu (L)");
    }
    if (containsConcept(ctx, 'bobin') || containsConcept(ctx, 'indüktans') || containsConcept(ctx, 'devre') || ctx.includes('henry') || ctx.includes('rlc')) {
      return translate("Bobin İndüktansı (L)");
    }
    if (ctx.includes('lagrangian') || ctx.includes('lagrange') || containsConcept(ctx, 'eylem') || ctx.includes('t - v') || ctx.includes('t-v')) {
      return translate("Lagrangian Fonksiyonu (L = T - V)");
    }
    if (containsConcept(ctx, 'açısal momentum') || containsConcept(ctx, 'dönme')) {
      return translate("Açısal Momentum Büyüklüğü (L)");
    }
    return translate("Uzunluk Parametresi (L)");
  }

  // R Sembolü
  if (cleaned === 'R') {
    if (containsConcept(ctx, 'direnç') || ctx.includes('ohm') || containsConcept(ctx, 'devre') || containsConcept(ctx, 'akım') || containsConcept(ctx, 'gerilim') || ctx.includes('volt')) {
      return translate("Elektriksel Direnç (R)");
    }
    if (containsConcept(ctx, 'yarıçap') || containsConcept(ctx, 'çember') || containsConcept(ctx, 'küre') || containsConcept(ctx, 'yörünge') || containsConcept(ctx, 'dairesel') || containsConcept(ctx, 'silindir') || containsConcept(ctx, 'sarkaç')) {
      return translate("Yörünge Yarıçapı (R)");
    }
    if (containsConcept(ctx, 'gaz sabiti') || ctx.includes('ideal gaz') || containsConcept(ctx, 'termodinamik')) {
      return translate("Evrensel Gaz Sabiti (R)");
    }
    return translate("Elektriksel Direnç (R)");
  }

  // T Sembolü
  if (cleaned === 'T') {
    if (containsConcept(ctx, 'periyot') || containsConcept(ctx, 'salınım') || containsConcept(ctx, 'frekans') || ctx.includes('harmonik') || ctx.includes('saniye') || containsConcept(ctx, 'sarkaç')) {
      return translate("Salınım Periyodu (T)");
    }
    if (containsConcept(ctx, 'gerilme') || containsConcept(ctx, 'ip gerilmesi') || containsConcept(ctx, 'bağlı ip') || ctx.includes('gerilme kuvveti')) {
      return translate("İp Gerilme Kuvveti (T)");
    }
    if (containsConcept(ctx, 'sıcaklık') || ctx.includes('kelvin') || containsConcept(ctx, 'termodinamik') || containsConcept(ctx, 'ısı') || containsConcept(ctx, 'termo')) {
      return translate("Mutlak Sıcaklık (T)");
    }
    return translate("Salınım Periyodu (T)");
  }

  // lambda Sembolü
  if (cleaned === '\\lambda' || cleaned === 'lambda') {
    if (containsConcept(ctx, 'dalga') || containsConcept(ctx, 'ışık') || containsConcept(ctx, 'optik') || containsConcept(ctx, 'foton') || containsConcept(ctx, 'kırılma')) {
      return translate("Dalga Boyu (λ)");
    }
    if (containsConcept(ctx, 'kütle') || containsConcept(ctx, 'yoğunluk') || containsConcept(ctx, 'çubuk') || containsConcept(ctx, 'doğrusal kütle') || ctx.includes('kg/m')) {
      return translate("Doğrusal Kütle Yoğunluğu (λ)");
    }
    if (containsConcept(ctx, 'kısıt') || containsConcept(ctx, 'lagrange çarpanı') || containsConcept(ctx, 'holonomik') || containsConcept(ctx, 'optimizasyon')) {
      return translate("Lagrange Kısıt Çarpanı (λ)");
    }
    return translate("Dalga Boyu (λ)");
  }

  // k Sembolü
  if (cleaned === 'k') {
    if (containsConcept(ctx, 'yay') || ctx.includes('hooke') || containsConcept(ctx, 'uzama') || containsConcept(ctx, 'sıkışma')) {
      return translate("Yay Sabiti (k)");
    }
    if (ctx.includes('boltzmann') || containsConcept(ctx, 'gaz') || containsConcept(ctx, 'entropi')) {
      return translate("Boltzmann Sabiti (k)");
    }
    if (containsConcept(ctx, 'dalga') || containsConcept(ctx, 'dalga sayısı') || containsConcept(ctx, 'radyan/m')) {
      return translate("Dalga Sayısı (k)");
    }
    return translate("Yay Sabiti (k)");
  }

  // tau Sembolü
  if (cleaned === '\\tau' || cleaned === 'tau') {
    if (containsConcept(ctx, 'tork') || ctx.includes('moment') || containsConcept(ctx, 'dönme') || containsConcept(ctx, 'açısal ivme')) {
      return translate("Tork (τ)");
    }
    if (containsConcept(ctx, 'devre') || ctx.includes('rc') || ctx.includes('rl') || containsConcept(ctx, 'zaman sabiti')) {
      return translate("Karakteristik Devre Zaman Sabiti (τ)");
    }
    return translate("Tork (τ)");
  }

  // mu Sembolü
  if (cleaned === '\\mu' || cleaned === 'mu') {
    if (containsConcept(ctx, 'sürtünme') || containsConcept(ctx, 'zemin') || containsConcept(ctx, 'eğik düzlem') || containsConcept(ctx, 'kayma')) {
      return translate("Sürtünme Katsayısı (μ)");
    }
    if (containsConcept(ctx, 'indirgenmiş') || containsConcept(ctx, 'iki cisim')) {
      return translate("İndirgenmiş Kütle (μ)");
    }
    if (containsConcept(ctx, 'manyetik') || containsConcept(ctx, 'geçirgenlik')) {
      return translate("Manyetik Geçirgenlik (μ)");
    }
    return translate("Sürtünme Katsayısı (μ)");
  }

  // p Sembolü
  if (cleaned === 'p') {
    if (ctx.includes('momentum') || containsConcept(ctx, 'çarpışma') || containsConcept(ctx, 'hız') || containsConcept(ctx, 'kütle')) {
      return translate("Doğrusal Momentum (p)");
    }
    if (containsConcept(ctx, 'basınç') || containsConcept(ctx, 'paskal') || containsConcept(ctx, 'akışkan') || containsConcept(ctx, 'gaz')) {
      return translate("Basınç (p)");
    }
    return translate("Doğrusal Momentum (p)");
  }

  // V Sembolü
  if (cleaned === 'V') {
    if (containsConcept(ctx, 'gerilim') || ctx.includes('volt') || containsConcept(ctx, 'potansiyel') || containsConcept(ctx, 'devre') || containsConcept(ctx, 'kaynak')) {
      return translate("Elektriksel Gerilim (V)");
    }
    if (containsConcept(ctx, 'hacim') || containsConcept(ctx, 'gaz') || containsConcept(ctx, 'özkütle') || ctx.includes('m^3')) {
      return translate("Hacim (V)");
    }
    if (containsConcept(ctx, 'potansiyel enerji') || ctx.includes('lagrangian') || containsConcept(ctx, 'enerji')) {
      return translate("Potansiyel Enerji Fonksiyonu (V)");
    }
    return translate("Elektriksel Gerilim (V)");
  }

  return null;
}

/**
 * Akıllı Matematiksel & Fiziksel İfade Anlamlandırıcı:
 * Asla "matematiksel ifade" demez; ifadenin fiziksel rolünü, parametre adını veya kanununu çözer.
 * Bağlam metni verildiğinde L, R, T gibi çok anlamlı harfleri probleme göre TEK ve KESİN anlama indirger.
 */
export function getMathMeaning(rawExpr: string, contextText?: string): string {
  const expr = rawExpr.trim();
  const cleaned = expr.replace(/[{}]/g, '').trim();

  // 1. Bağlamsal Ayrıştırma (Örn: Sarkaçta L -> İp Uzunluğu, Devrede L -> Bobin İndüktansı)
  const disambiguated = disambiguateSymbol(cleaned, contextText);
  if (disambiguated) return disambiguated;

  // 2. Doğrudan sözlük eşleşmesi
  if (COMMON_SYMBOL_MEANINGS[expr]) return translate(COMMON_SYMBOL_MEANINGS[expr]);
  if (COMMON_SYMBOL_MEANINGS[cleaned]) return translate(COMMON_SYMBOL_MEANINGS[cleaned]);

  const stripped = cleaned.replace(/^\\/, '');
  if (COMMON_SYMBOL_MEANINGS[stripped]) return translate(COMMON_SYMBOL_MEANINGS[stripped]);

  // 3. Taban + İndis analizi (Örn: R_L -> Yük Direnci, V_{in} -> Giriş Gerilimi)
  const subMatch = cleaned.match(/^([a-zA-Z\\]+)_([a-zA-Z0-9]+)$/);
  if (subMatch) {
    const baseRaw = subMatch[1];
    const subRaw = subMatch[2];
    const rawBaseName = BASE_NAMES[baseRaw] || BASE_NAMES[baseRaw.replace(/^\\/, '')];
    const baseName = rawBaseName ? translate(rawBaseName) : undefined;
    const subName = SUBSCRIPT_NAMES[subRaw] ? translate(SUBSCRIPT_NAMES[subRaw]) : undefined;

    if (baseName && subName) {
      return `${subName} ${baseName} (${expr})`;
    }
    if (baseName) {
      return translate("{0} Parametresi ({1})", [baseName, expr]);
    }
  }

  // 4. Meşhur fizik bağıntıları / kanunları
  for (const formula of FAMOUS_FORMULAS) {
    if (formula.match.test(expr)) {
      return translate(formula.name);
    }
  }

  // 5. İçerik ve semantik yapı analizi (Asla 'matematiksel ifade' deme!)
  if (expr.includes('=') || expr.includes('\\approx') || expr.includes('\\equiv')) {
    if (expr.includes('\\frac{d}{dt}') || expr.includes('\\ddot') || expr.includes('\\dot')) {
      return translate("Diferansiyel Dinamik Hareket Bağıntısı");
    }
    if (expr.includes('\\int') || expr.includes('\\sum')) {
      return translate("İntegral Toplam Eşitliği");
    }
    if (expr.includes('\\vec') || expr.includes('\\hat')) {
      return translate("Vektörel Denge ve Yön Bağıntısı");
    }
    return translate("Fiziksel Eşitlik Bağıntısı");
  }

  if (expr.includes('\\frac{d}{dt}') || expr.includes('\\partial') || expr.includes('\\dot')) {
    return translate("Zamana Göre Değişim Oranı (Türevsel Dinamik İfade)");
  }

  if (expr.includes('\\int')) {
    return translate("İntegral Alan ve Birikim İfadesi");
  }

  if (expr.includes('\\vec')) {
    return translate("Vektörel Büyüklük İfadesi");
  }

  // Son çare: 'Fiziksel Parametre'
  return translate("Fiziksel Parametre: {0}", [cleaned]);
}

/**
 * Geriye dönük uyumluluk sarmalayıcısı
 */
export function getSymbolMeaning(expr: string, contextText?: string): string | null {
  return getMathMeaning(expr, contextText);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * KaTeXRenderer (Fail-soft & İnteraktif):
 * Metin içindeki $...$, $$...$$, \(...\) veya \[...\] formüllerini KaTeX ile derler.
 * Paragraf içindeki her formül ve sembol tıklanabilir hale getirilebilir;
 * üzerine gelindiğinde (hover) kesin fiziksel adı gösterilir (asla 'matematiksel ifade' denmez!).
 */
export const KaTeXRenderer: React.FC<KaTeXRendererProps> = ({
  content,
  block = false,
  className = '',
  contextText,
  onFormulaClick
}) => {
  const language = useLanguage();
  const inheritedContext = useContext(MathExplanationContext);
  const effectiveContext = contextText || inheritedContext || '';
  const text = typeof content === 'string' ? content : content ? String(content) : '';

  // Blok modunda tek denklemi render et
  if (block) {
    let renderedHtml = '';
    try {
      renderedHtml = katex.renderToString(text, {
        displayMode: true,
        throwOnError: false,
        trust: false
      });
    } catch {
      renderedHtml = `<span class="katex-error">${escapeHtml(text)}</span>`;
    }

    return (
      <div
        className={`katex-content block my-2 text-center select-text ${className}`}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  }

  // Paragraf / Satır İçi modunda formülleri ayrıştır ve tıklanabilir yap
  const elements = useMemo(() => {
    if (!text) return null;

    const parts = normalizeInlineMath(text).split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g);

    return parts.map((part, index) => {
      const isDisplay = (part.startsWith('$$') && part.endsWith('$$')) || (part.startsWith('\\[') && part.endsWith('\\]'));
      const isInline = (part.startsWith('$') && part.endsWith('$')) || (part.startsWith('\\(') && part.endsWith('\\)'));

      if (isDisplay || isInline) {
        const formula = (part.startsWith('\\') || isDisplay) ? part.slice(2, -2).trim() : part.slice(1, -1).trim();
        const isSingle = isSingleMathSymbol(formula);
        const meaning = getMathMeaning(formula, effectiveContext);

        let html = '';
        try {
          html = katex.renderToString(formula, {
            displayMode: isDisplay,
            throwOnError: false,
            trust: false
          });
        } catch {
          html = `<span class="katex-error">${escapeHtml(part)}</span>`;
        }

        const tooltip = translate("{0} • Detaylı türetim ve analiz için çift tıklayın", [meaning]);

        return (
          <span
            key={`math-${index}`}
            onDoubleClick={(e) => {
              if (onFormulaClick) {
                e.stopPropagation();
                onFormulaClick(formula, isSingle);
              }
            }}
            title={tooltip}
            className={`interactive-math-tag inline ${
              onFormulaClick ? 'cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-950/40' : ''
            }`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }

      // Düz metin parçaları
      return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
    });
  }, [text, onFormulaClick, effectiveContext, language]);

  return <span className={`katex-content inline ${className}`}>{elements}</span>;
};

