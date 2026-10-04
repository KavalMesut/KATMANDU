import { translate } from '../i18n';
import { throwIfAborted, isRequestStopped } from './requestControl';

// PDF tools and their compatibility shims load only when a PDF is opened.
let library: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | undefined;
async function loadPdfLibrary() {
  library ??= import('pdfjs-dist/legacy/build/pdf.mjs').then(pdfjs => {
    if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
    return pdfjs;
  });
  return library;
}
export const MAX_PDF_IMAGE_PAGES = 20;

type PdfDocument = import('pdfjs-dist/types/src/display/api').PDFDocumentProxy;
function decodePdf(data: string): { bytes: Uint8Array; binary: string } {
  const binary = atob(data.includes('base64,') ? data.split('base64,')[1].trim() : data.trim());
  return { binary, bytes: Uint8Array.from(binary, char => char.charCodeAt(0)) };
}
async function withPdf<T>(bytes: Uint8Array, signal: AbortSignal | undefined, work: (doc: PdfDocument) => Promise<T>): Promise<T> {
  throwIfAborted(signal);
  const pdfjs = await loadPdfLibrary();
  throwIfAborted(signal);
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true });
  const stop = () => { void task.destroy().catch(() => undefined); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    const document = await task.promise;
    throwIfAborted(signal);
    return await work(document);
  } catch (error) { throwIfAborted(signal); throw error; }
  finally { signal?.removeEventListener('abort', stop); await task.destroy(); }
}

/** Extract all readable pages, releasing the worker even after a failure or cancellation. */
export async function extractTextFromPdf(data: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  try {
    const { binary, bytes } = decodePdf(data);
    if (!binary.startsWith('%PDF-')) return fallbackExtractText(data);
    return await withPdf(bytes, signal, async document => {
      const pages: string[] = [];
      for (let number = 1; number <= document.numPages; number++) {
        throwIfAborted(signal);
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str : '').filter(text => text.trim()).join(' ');
        if (text.trim()) pages.push(`[Sayfa ${number}]\n${text.trim()}`);
      }
      return pages.join('\n\n').trim() || translate("PDF belgesinde okunabilir metin bulunamadı (Taranmış görsel PDF olabilir).");
    });
  } catch (error) {
    throwIfAborted(signal);
    if (isRequestStopped(error)) throw error;
    console.warn('PDF metin çıkarma uyarısı, yedek çıkarıcı deneniyor:', error);
    return fallbackExtractText(data);
  }
}

/**
 * Taranmış veya pdfjs çalışmayan ortamlar için basit akış çıkarıcı
 */
function fallbackExtractText(dataBase64OrDataUrl: string): string {
  try {
    let base64 = dataBase64OrDataUrl;
    if (base64.includes('base64,')) {
      base64 = base64.split('base64,')[1];
    }
    const binary = atob(base64);
    // PDF içindeki (BT ... ET) metin bloklarını kabaca yakala
    const matches = binary.match(/\(([^)]+)\)\s*Tj/g);
    if (matches && matches.length > 0) {
      return matches.map((m) => m.replace(/[()]/g, '').replace(/\s*Tj/, '')).join(' ');
    }
  } catch (e) {
    console.warn('Fallback PDF çıkarıcı da başarısız:', e);
  }
  return translate("PDF belgesi içeriği çıkarılamadı.");
}

/** Render every page or reject explicitly; never return a truncated document. */
export async function renderPdfPagesToImages(data: string, maxPages = MAX_PDF_IMAGE_PAGES, signal?: AbortSignal): Promise<string[]> {
  throwIfAborted(signal);
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  try {
    const { binary, bytes } = decodePdf(data);
    if (!binary.startsWith('%PDF-')) throw new Error(translate("Geçerli bir PDF belgesi yükleyin."));
    return await withPdf(bytes, signal, async pdf => {
      if (pdf.numPages > maxPages) throw new PdfPageLimitError(translate("PDF {0} sayfa içeriyor. Görsellerin eksiksiz gönderilmesi için belgeyi en fazla {1} sayfalık dosyalara bölün.", [pdf.numPages, maxPages]));
      const images: string[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        throwIfAborted(signal);
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error(translate("PDF sayfası görsele dönüştürülemedi. Belgeyi görsel olarak yükleyin."));
        const rendering = page.render({ canvasContext: context, viewport, canvas });
        const cancel = () => rendering.cancel();
        signal?.addEventListener('abort', cancel, { once: true });
        try { await rendering.promise; } finally { signal?.removeEventListener('abort', cancel); }
        throwIfAborted(signal);
        images.push(canvas.toDataURL('image/png'));
        canvas.width = 0; canvas.height = 0;
      }
      return images;
    });
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof PdfPageLimitError || isRequestStopped(error)) throw error;
    throw new Error(translate("PDF sayfaları eksiksiz görüntülenemedi: {0}", [error instanceof Error ? error.message : String(error)]));
  }
}

export function isPdfAttachment(att: { type?: string; mimeType?: string; name?: string; data?: string }): boolean {
  if (att.type === 'pdf') return true;
  if (att.mimeType && att.mimeType.toLowerCase().includes('pdf')) return true;
  if (att.name && att.name.toLowerCase().endsWith('.pdf')) return true;
  if (att.data && (att.data.startsWith('JVBERi0') || att.data.startsWith('data:application/pdf'))) return true;
  return false;
}


class PdfPageLimitError extends Error {}
