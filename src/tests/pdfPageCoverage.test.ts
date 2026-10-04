// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ pages: 5, rendered: [] as number[], destroy: vi.fn(async () => undefined), worker: { workerSrc: '' } }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: fixture.worker,
  getDocument: () => ({ destroy: fixture.destroy, promise: Promise.resolve({ numPages: fixture.pages, getPage: async (number: number) => ({
    getViewport: () => ({ width: 10, height: 10 }), render: () => { fixture.rendered.push(number); return { promise: Promise.resolve() }; }
  }) }) })
}));
import { renderPdfPagesToImages } from '../domain/pdfExtractor';
beforeEach(() => {
  fixture.pages = 5; fixture.rendered = []; fixture.destroy.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,image');
});
afterEach(() => vi.restoreAllMocks());
describe('PDF visual coverage', () => {
  it('renders every page including diagrams after page three', async () => {
    expect(await renderPdfPagesToImages(btoa('%PDF-1.7 test'))).toHaveLength(5);
    expect(fixture.rendered).toEqual([1, 2, 3, 4, 5]); expect(fixture.destroy).toHaveBeenCalledOnce();
  });
  it('rejects oversized documents instead of silently truncating them', async () => {
    fixture.pages = 21;
    await expect(renderPdfPagesToImages(btoa('%PDF-1.7 test'))).rejects.toThrow('21 sayfa');
    expect(fixture.rendered).toEqual([]); expect(fixture.destroy).toHaveBeenCalledOnce();
  });
  it('does not continue with text only when a page cannot be rendered', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(renderPdfPagesToImages(btoa('%PDF-1.7 test'))).rejects.toThrow('görsele dönüştürülemedi');
  });
});
