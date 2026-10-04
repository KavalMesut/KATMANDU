import { describe, it, expect } from 'vitest';
import { safeJsonParse, repairLatexEscapesInJson } from '../domain/jsonRepair';

describe('JSON LaTeX Kaçış Onarımı (jsonRepair)', () => {
  it('Standart JSON.parse ile çöken unescaped LaTeX komutlarını onarıp ayrıştırmalıdır', () => {
    // Bu dize standart JSON.parse(malformed) ile "Bad escaped character in JSON" hatası verir!
    const malformed = `{\n  "latex": "\\alpha + \\beta = \\frac{\\theta}{\\lambda}",\n  "explanation": "Newton: \\vec{F} = m\\vec{a} ve \\ddot{x} türevi"\n}`;

    // Normal JSON.parse hata verir
    expect(() => JSON.parse(malformed)).toThrow(/Bad escaped character|Unexpected token/);

    const repaired = repairLatexEscapesInJson(malformed);
    expect(repaired).toContain('\\\\alpha');
    expect(repaired).toContain('\\\\theta');

    // safeJsonParse ise onararak başarıyla ayrıştırır
    const parsed = safeJsonParse<{ latex: string; explanation: string }>(malformed);
    expect(parsed.latex).toContain('alpha');
    expect(parsed.latex).toContain('frac');
    expect(parsed.latex).toContain('theta');
    expect(parsed.latex).toContain('lambda');
    expect(parsed.explanation).toContain('vec{F}');
  });

  it('Dize içi gerçek satır sonlarını (unescaped newline) onarmalıdır', () => {
    const rawWithNewlines = `{\n  "title": "Bölüm 1",\n  "text": "Satır 1\nSatır 2"\n}`;

    const parsed = safeJsonParse<{ title: string; text: string }>(rawWithNewlines);
    expect(parsed.title).toBe('Bölüm 1');
    expect(parsed.text).toContain('Satır 1');
    expect(parsed.text).toContain('Satır 2');
  });

  it('Markdown codeblock ile sarılı JSON metinlerini temizleyip ayrıştırmalıdır', () => {
    const wrapped = '```json\n{\n  "status": "ok",\n  "formula": "\\nabla \\times \\vec{E} = -\\frac{\\partial \\vec{B}}{\\partial t}"\n}\n```';

    const parsed = safeJsonParse<{ status: string; formula: string }>(wrapped);
    expect(parsed.status).toBe('ok');
    expect(parsed.formula).toContain('nabla');
  });
});
