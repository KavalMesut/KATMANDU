import { describe, expect, it } from 'vitest';
import { buildOpenAIRequest, extractOpenAIText, requiresResponsesApi } from '../providers/openaiProtocol';

describe('OpenAI protocol compatibility', () => {
  it('Responses API için metin, görsel ve PDF içeriklerini doğru biçime çevirir', () => {
    const request = buildOpenAIRequest('gpt-6-sol', [{ role: 'user', content: [
      { type: 'text', text: 'Bu soruyu çöz' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
      { type: 'file', file: { filename: 'soru.pdf', file_data: 'data:application/pdf;base64,JVBERg==' } }
    ] }], 'high', 'responses');

    expect(request).toMatchObject({
      model: 'gpt-6-sol',
      reasoning: { effort: 'high' },
      text: { format: { type: 'json_object' } },
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'Bu soruyu çöz' },
        { type: 'input_image', image_url: 'data:image/png;base64,aGVsbG8=' },
        { type: 'input_file', filename: 'soru.pdf', file_data: 'data:application/pdf;base64,JVBERg==' }
      ] }]
    });
  });

  it('Responses çıktısındaki metni alır ve yalnızca protokol uyumsuzluğunda geçiş önerir', () => {
    expect(extractOpenAIText({ output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }] }, 'responses')).toBe('{"ok":true}');
    expect(requiresResponsesApi(400, 'Model is not supported in /v1/chat/completions; use Responses API')).toBe(true);
    expect(requiresResponsesApi(400, 'Unknown model ID')).toBe(false);
  });
});
