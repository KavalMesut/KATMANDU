import english from './en.json';

export type Language = 'en' | 'tr';
const LANGUAGE_KEY = 'katmandu_language_v1';
const messages: Record<string, string> = english;
const turkish: Record<string, string> = Object.fromEntries(Object.entries(messages).map(([source, target]) => [target, source]));
const listeners = new Set<() => void>();

function readLanguage(): Language {
  try { return globalThis.localStorage?.getItem(LANGUAGE_KEY) === 'tr' ? 'tr' : 'en'; }
  catch { return 'en'; }
}
let language: Language = readLanguage();

export function getLanguage(): Language { return language; }
export function getLocale(): string { return language === 'tr' ? 'tr-TR' : 'en-US'; }
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function setLanguage(value: Language): void {
  language = value === 'tr' ? 'tr' : 'en';
  try { globalThis.localStorage?.setItem(LANGUAGE_KEY, language); } catch { /* The selection still works for this session. */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.title = language === 'tr' ? 'KATMANDU — Bilimsel Çözüm ve Derinleşme Motoru' : 'KATMANDU — Scientific Problem Solving and Derivation';
  }
  listeners.forEach(listener => listener());
}

/** Turkish source strings are the secondary catalog; English is the default catalog. */
export function translate(message: string, values: readonly unknown[] = [], selected: Language = language): string {
  const localized = selected === 'tr' ? turkish[message] ?? message : messages[message] ?? message;
  return localized.replace(/\{(\d+)\}/g, (placeholder, index: string) => Number(index) < values.length ? String(values[Number(index)]) : placeholder);
}
export function createTranslator(selected: Language) {
  return (message: string, values: readonly unknown[] = []) => translate(message, values, selected);
}

/** Keep output language independent of the language of the question or previous layers. */
export function localizePrompt(prompt: string, selected: Language = language): string {
  const outputLanguage = selected === 'tr' ? 'Turkish' : 'English';
  // Legacy prompts contain explicit Turkish-only rules. Replace them before sending.
  const localized = prompt
    .replace(/^.*(?:DİL KURALI|SADECE TÜRKÇE).*$/gm, '')
    .replace(/eksiksiz Türkçe olarak transkribe et/g, `transcribe completely in ${outputLanguage}`);
  return `${localized}\n\nINPUT LANGUAGE: Detect the language of the supplied question automatically; accept mixed-language questions and do not require an input language setting. Preserve all given quantities, mathematical notation and original subpart labels when interpreting the question.\n\nOUTPUT LANGUAGE (MANDATORY): Write all user-visible titles, descriptions, problem transcriptions, summaries, assumptions, strategies, explanations, verification notes and diagram text labels in ${outputLanguage}. This applies to question detection, solutions, expansions and alternative methods regardless of the input language. Preserve JSON property names, identifiers, original subpart labels and mathematical notation. Return only the JSON schema requested above.`;
}

/** Only content fields are localized; schema identifiers and enum values stay stable. */
const demoTextFields = new Set([
  'title', 'text', 'problemTitle', 'problemText', 'caption', 'strategy', 'summary',
  'instruction', 'rawText', 'description', 'explanation', 'note', 'reason', 'badge',
  'query', 'methodName', 'dimensionalAnalysis', 'expected', 'analysis', 'assumptions',
  'condition', 'label', 'xLabel', 'yLabel', 'latex'
]);
export function translateDemoData<T>(value: T, selected: Language, field?: string): T {
  if (typeof value === 'string') {
    return (field === undefined || demoTextFields.has(field) ? translate(value, [], selected) : value) as T;
  }
  if (Array.isArray(value)) return value.map(item => translateDemoData(item, selected, field)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateDemoData(item, selected, key)])) as T;
  }
  return value;
}

/** Application-generated numbered tab labels, never arbitrary solution titles. */
export function localizeTabTitle(title: string): string {
  const match = /^(?:Çalışma|Study|Soru|Question) (\d+)$/.exec(title);
  if (!match) return translate(title);
  const key = /^(?:Çalışma|Study)/.test(title) ? 'Çalışma {0}' : 'Soru {0}';
  return translate(key, [match[1]]);
}
