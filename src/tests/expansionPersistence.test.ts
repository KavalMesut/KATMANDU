import { beforeEach, describe, expect, it } from 'vitest';
import { TrustedAssembler } from '../domain/trustedAssembler';
import { contextualCacheKey, equationCacheKey, restoreExpansions } from '../domain/expansionState';
import { LibraryStorage } from '../domain/libraryStorage';
import { EquationBlock, ExpansionLayer } from '../domain/types';

const doc = TrustedAssembler.assembleSolution({ id: 'p', text: 'Kuvvet', createdAt: 1 }, {
  problemTitle: 'Kuvvet', strategy: '', sections: [{ title: 'Çözüm', blocks: [{ kind: 'equation', latex: 'F=ma' }] }]
});
const rootEquation = doc.sections[0].blocks[0] as EquationBlock;
const makeLayer = (id: string, parentLayerId: string, target: EquationBlock, depth: number): ExpansionLayer => ({
  id, parentLayerId, depth, targetBlockId: target.id, cacheKey: equationCacheKey(parentLayerId, target),
  title: id, isAxiomatic: false, isTerminal: false,
  blocks: [{ id: `${id}-eq`, kind: 'equation', latex: `${id}=1` }]
});

beforeEach(() => LibraryStorage.clearAll());

describe('Persisted expansion structure', () => {
  it('round-trips three levels and sibling branches, even when saved out of order', async () => {
    const a = makeLayer('a', 'root', rootEquation, 1);
    const b = makeLayer('b', 'a', a.blocks[0] as EquationBlock, 2);
    const c = makeLayer('c', 'b', b.blocks[0] as EquationBlock, 3);
    const sibling: ExpansionLayer = { ...makeLayer('sibling', 'a', a.blocks[0] as EquationBlock, 2),
      contextualQuery: 'Neden?', requestContext: { selectedText: 'a=1', userQuery: 'Neden?' },
      cacheKey: contextualCacheKey('a', a.blocks[0].id, 'a=1', 'Neden?') };
    const item = { ...LibraryStorage.createLibraryItemFromDocument(doc, [c, sibling, b, a]), rating: 9, tags: ['custom'] };
    await LibraryStorage.saveItem(item);
    const saved = (await LibraryStorage.getItem(item.id))!;
    const restored = restoreExpansions(saved.document, saved.layers);
    expect(restored.tree.children.map(n => n.id)).toEqual(['a']);
    expect(restored.tree.children[0].children.map(n => n.id).sort()).toEqual(['b', 'sibling']);
    expect(restored.tree.children[0].children.find(n => n.id === 'b')?.children[0].id).toBe('c');
    expect(restored.cache[equationCacheKey('root', rootEquation)]?.id).toBe('a');
    expect(restored.cache[sibling.cacheKey!]?.id).toBe('sibling');
    await LibraryStorage.updateLayers(item.id, Object.values(restored.cache));
    expect(await LibraryStorage.getItem(item.id)).toMatchObject({ rating: 9, tags: ['custom'], metadata: item.metadata });
  });

  it('infers legacy parents and equation cache keys from block ownership', () => {
    const a = makeLayer('a', 'root', rootEquation, 1);
    const b = makeLayer('b', 'a', a.blocks[0] as EquationBlock, 2);
    for (const layer of [a, b]) { delete layer.parentLayerId; delete layer.cacheKey; }
    const { tree, cache } = restoreExpansions(doc, [b, a]);
    expect(tree.children[0].children[0].id).toBe('b');
    expect(cache[equationCacheKey('a', a.blocks[0] as EquationBlock)]?.id).toBe('b');
    // Read migration does not mutate the stored source object.
    expect(b.parentLayerId).toBeUndefined();
  });

  it('keeps unresolved/cyclic legacy nodes without inventing a reusable request', () => {
    const a = makeLayer('a', 'b', rootEquation, 3);
    const b = makeLayer('b', 'a', rootEquation, 4);
    const { tree, cache } = restoreExpansions(doc, [a, b]);
    expect(tree.children).toHaveLength(2);
    expect(tree.children.every(n => n.label.includes('üst bağlantısı bilinmiyor'))).toBe(true);
    expect(cache[a.cacheKey!]).toBeUndefined();
    expect(Object.values(cache)).toHaveLength(2);
  });

  it('migrates main-branch parentId and equation keys without duplicating layers', () => {
    const a = makeLayer('a', 'root', rootEquation, 1);
    const b = makeLayer('b', 'a', a.blocks[0] as EquationBlock, 2);
    for (const layer of [a, b]) {
      layer.parentId = layer.parentLayerId;
      delete layer.parentLayerId;
      layer.cacheKey = `eq_${layer.parentId}_${layer.targetBlockId}_legacy`;
    }
    const { tree, cache } = restoreExpansions(doc, [b, a]);
    expect(tree.children[0].children[0].id).toBe('b');
    expect(cache[equationCacheKey('root', rootEquation)].id).toBe('a');
    expect(Object.values(cache)).toHaveLength(2);
    expect(a.parentLayerId).toBeUndefined();
  });

  it('preserves a main-branch contextual request key for exact legacy lookups', () => {
    const layer = makeLayer('legacy-context', 'root', rootEquation, 1);
    layer.parentId = 'root'; delete layer.parentLayerId;
    layer.contextualQuery = 'Neden?';
    layer.cacheKey = `ctx_root_${rootEquation.id}_F=ma_Neden?`;
    const { cache } = restoreExpansions(doc, [layer]);
    expect(cache[layer.cacheKey].id).toBe(layer.id);
  });

  it('retains old contextual content even when the original selected text is unavailable', () => {
    const layer = makeLayer('context', 'root', rootEquation, 1);
    delete layer.cacheKey;
    layer.contextualQuery = 'Açıkla';
    const { tree, cache } = restoreExpansions(doc, [layer]);
    expect(tree.children[0].layer?.blocks).toEqual(layer.blocks);
    expect(cache[equationCacheKey('root', rootEquation)]).toBeUndefined();
  });
});
