import { translate } from '../i18n';
import { ProblemAttachment } from '../domain/types';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

/** Chat Completions file parts preserve both text and scanned PDF page images.
 * https://developers.openai.com/api/docs/guides/file-inputs
 * The server validates document readability and the configured model's capabilities.
 */
export function buildOpenAIContent(text: string, attachments: ProblemAttachment[] = []): string | ContentPart[] {
  if (attachments.length === 0) return text;
  const parts: ContentPart[] = [{ type: 'text', text }];
  let pdfBytes = 0;
  for (const attachment of attachments) {
    const data = attachment.data || attachment.dataUrl || '';
    if (attachment.type === 'image') {
      parts.push({ type: 'image_url', image_url: {
        url: attachment.dataUrl || (data.startsWith('data:') ? data : `data:${attachment.mimeType};base64,${data}`)
      } });
      continue;
    }
    const base64 = (data.startsWith('data:') ? data.split('base64,')[1] || '' : data).replace(/\s/g, '');
    let bytes: string;
    try {
      bytes = atob(base64);
      if (!bytes.startsWith('%PDF-')) throw new Error('Invalid header');
    } catch {
      throw new Error(translate("PDF okunamadı: {0}. Geçerli bir PDF dosyası yükleyin.", [attachment.name]));
    }
    pdfBytes += bytes.length;
    if (bytes.length >= 50_000_000 || pdfBytes > 50_000_000) {
      throw new Error(translate("PDF dosyalarının toplam boyutu 50 MB sınırını aşıyor. Belgeyi daha küçük parçalara ayırın."));
    }
    parts.push({ type: 'file', file: {
      filename: attachment.name || 'document.pdf',
      file_data: `data:application/pdf;base64,${base64}`
    } });
  }
  return parts;
}

export class OpenAIRequestError extends Error {}
