import type { LibraryItem } from './types';

export type LibrarySummary = Omit<LibraryItem, 'document' | 'layers'> & { layerCount: number };
export function summarizeLibraryItem(item: LibraryItem): LibrarySummary {
  const { document: _document, layers, ...summary } = item;
  return { ...summary, layerCount: layers?.length || 0 };
}
