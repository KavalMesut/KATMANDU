import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../providers/openaiProvider';
import { DEFAULT_CONFIG } from '../domain/config';
import { ProblemAttachment, ProblemInput } from '../domain/types';

const pdf: ProblemAttachment = {
  id: 'pdf', name: 'exam.pdf', type: 'pdf', mimeType: 'application/pdf',
  data: btoa('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF')
};
const problem: ProblemInput = { id: 'p', text: 'Yalnızca ikinci soruyu çöz.', createdAt: 0, attachments: [pdf] };
const provider = () => new OpenAIProvider({ ...DEFAULT_CONFIG, openaiApiKey: 'test-key' }, 0);
afterEach(() => vi.unstubAllGlobals());

function mockSuccess() {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ problemTitle: 'Çözüm', strategy: '', sections: [], questions: [{ questionNumber: 1, instruction: 'Soruyu çöz.' }] }) } }] }) });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('OpenAI PDF request transport', () => {
  it.each(['solve', 'detectQuestions'] as const)('%s includes the PDF bytes, images and original text', async method => {
    const fetch = mockSuccess();
    await provider()[method]({ ...problem, attachments: [pdf, { id: 'image', name: 'figure.png', type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const content = body.messages[1].content;
    expect(content).toContainEqual({ type: 'file', file: { filename: 'exam.pdf', file_data: `data:application/pdf;base64,${pdf.data}` } });
    expect(content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } });
    expect(content[0].text).toContain(problem.text);
  });

  it('preserves data-URL PDF bytes without double encoding, including scanned documents', async () => {
    const fetch = mockSuccess();
    const scanned = btoa('%PDF-1.7\n1 0 obj << /Subtype /Image >> endobj\n%%EOF');
    await provider().solve({ ...problem, attachments: [{ ...pdf, data: `data:application/pdf;base64,${scanned}` }] });
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[1].content[1].file.file_data).toBe(`data:application/pdf;base64,${scanned}`);
  });

  it.each(['solve', 'detectQuestions'] as const)('%s rejects invalid files before HTTP', async method => {
    const fetch = mockSuccess();
    await expect(provider()[method]({ ...problem, attachments: [{ ...pdf, data: btoa('not a PDF') }] })).rejects.toThrow('PDF okunamadı');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['solve', 'detectQuestions'] as const)('%s surfaces unreadable/unsupported PDF errors without retry or text-only fallback', async method => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'No content could be read from file' } }) });
    vi.stubGlobal('fetch', fetch);
    await expect(provider()[method](problem)).rejects.toThrow('PDF işlenemedi');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps text-only input working', async () => {
    const fetch = mockSuccess();
    await provider().solve({ ...problem, attachments: [] });
    const content = JSON.parse(fetch.mock.calls[0][1].body).messages[1].content;
    expect(typeof content).toBe('string');
    expect(content).toContain(problem.text);
  });
});
