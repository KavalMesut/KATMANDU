import { describe, expect, it, vi } from 'vitest';
import { extractTextFromPdf } from '../domain/pdfExtractor';
function simplePdf(): string {
  const stream = 'BT /F1 12 Tf 20 100 Td (Compatibility test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n'; const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return btoa(pdf);
}
describe('PDF runtime compatibility', () => {
  it('reads a real PDF through PDF.js without a failed Promise.try or worker fallback', async () => {
    const warning = vi.spyOn(console, 'warn');
    try {
      expect(await extractTextFromPdf(simplePdf())).toContain('[Sayfa 1]\nCompatibility test');
      expect(warning.mock.calls.some(args => String(args[0]).includes('yedek çıkarıcı'))).toBe(false);
    } finally { warning.mockRestore(); }
  });
});
