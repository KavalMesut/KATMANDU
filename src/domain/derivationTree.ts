import { DerivationTreeNode, ExpansionLayer } from './types';

export const INITIAL_TREE: DerivationTreeNode = {
  id: 'root',
  parentId: null,
  label: '1. Yol: Ana Çözüm',
  depth: 0,
  nodeType: 'primary_solution',
  children: []
};

/**
 * Ağaca bağımsız alternatif çözüm yolu (2. Yol, 3. Yol vb.) ekleyen veya güncelleyen fonksiyon.
 * Alternatif çözümler ana çözüm ile aynı katman seviyesinde (depth: 0) paralel birer kök olarak yer alır.
 */
export function addParallelPathToTree(
  root: DerivationTreeNode,
  newPathNode: Omit<DerivationTreeNode, 'children'>
): DerivationTreeNode {
  const existingPaths = root.parallelPaths || [];
  const existingIdx = existingPaths.findIndex((p) => p.id === newPathNode.id);
  if (existingIdx >= 0) {
    const updated = [...existingPaths];
    updated[existingIdx] = {
      ...updated[existingIdx],
      ...newPathNode,
      children: updated[existingIdx].children || []
    };
    return { ...root, parallelPaths: updated };
  }
  return {
    ...root,
    parallelPaths: [
      ...existingPaths,
      {
        ...newPathNode,
        depth: 0,
        nodeType: 'alternative_solution',
        children: []
      }
    ]
  };
}

/**
 * Ağaca yeni düğüm ekleyen veya var olanı güncelleyen saf (immutable) fonksiyon.
 * Hem ana çözüm dalını hem de paralel alternatif çözüm yollarının alt dallarını destekler.
 */
export function addNodeToTree(
  root: DerivationTreeNode,
  parentId: string,
  newNode: Omit<DerivationTreeNode, 'children'>
): DerivationTreeNode {
  if (root.id === parentId) {
    const existingIdx = root.children.findIndex((c) => c.id === newNode.id);
    if (existingIdx >= 0) {
      const updated = [...root.children];
      updated[existingIdx] = { ...updated[existingIdx], ...newNode };
      return { ...root, children: updated };
    }
    return {
      ...root,
      children: [...root.children, { ...newNode, children: [] }]
    };
  }

  // Paralel yollar (2. Yol, 3. Yol) içinde ebeveyn düğümü ara
  let updatedParallel = root.parallelPaths;
  if (root.parallelPaths && root.parallelPaths.length > 0) {
    updatedParallel = root.parallelPaths.map((p) => {
      if (p.id === parentId) {
        const existingIdx = p.children.findIndex((c) => c.id === newNode.id);
        if (existingIdx >= 0) {
          const updated = [...p.children];
          updated[existingIdx] = { ...updated[existingIdx], ...newNode };
          return { ...p, children: updated };
        }
        return {
          ...p,
          children: [...p.children, { ...newNode, children: [] }]
        };
      }
      return addNodeToTree(p, parentId, newNode);
    });
  }

  return {
    ...root,
    children: root.children.map((child) => addNodeToTree(child, parentId, newNode)),
    parallelPaths: updatedParallel
  };
}

/**
 * Ağaçta belirli bir düğüme giden ebeveyn yolunu bulan fonksiyon.
 * Paralel yollara giden rotaları da çözümler.
 */
export function findPathToNode(
  current: DerivationTreeNode,
  targetId: string,
  currentPath: DerivationTreeNode[] = []
): DerivationTreeNode[] | null {
  const newPath = [...currentPath, current];
  if (current.id === targetId) {
    return newPath;
  }
  // Paralel alternatif yolları tara
  if (current.parallelPaths && current.parallelPaths.length > 0) {
    for (const p of current.parallelPaths) {
      if (p.id === targetId) {
        return [p];
      }
      const res = findPathToNode(p, targetId, []);
      if (res) return res;
    }
  }
  for (const child of current.children) {
    const res = findPathToNode(child, targetId, newPath);
    if (res) return res;
  }
  return null;
}

/**
 * Belirli bir bloğun hangi üst katmanda yer aldığını bulan yardımcı fonksiyon
 */
export function findParentLayerForBlock(
  cache: Record<string, ExpansionLayer>,
  blockId: string
): ExpansionLayer | null {
  for (const layer of Object.values(cache)) {
    if (layer.blocks.some((b) => b.id === blockId)) {
      return layer;
    }
  }
  return null;
}

/**
 * Denklem açma işlemi için deterministik önbellek anahtarı üretir
 */
export function deriveEquationCacheKey(parentKey: string, equationId: string, latex: string): string {
  return `eq_${parentKey}_${equationId}_${latex.trim()}`;
}

/**
 * Bağlamsal soru sorma / seçim sorgusu için deterministik önbellek anahtarı üretir
 */
export function deriveContextInquireCacheKey(
  parentKey: string,
  targetBlockId: string,
  selectedText: string,
  customQuery?: string
): string {
  return `ctx_${parentKey}_${targetBlockId}_${selectedText.trim()}_${(customQuery || '').trim()}`;
}

/**
 * Kaydedilmiş katman dizisinden ağaç hiyerarşisini ve önbelleği eksiksiz yeniden inşa eder.
 * Katmanları derinlik sırasına göre dizer, parentId ilişkilerini korur ve önbelleği
 * hem layer.id hem de layer.cacheKey üzerinden çift indeksler.
 */
export function reconstructTreeFromLayers(
  layers?: ExpansionLayer[]
): { tree: DerivationTreeNode; cache: Record<string, ExpansionLayer> } {
  let reconstructedTree = INITIAL_TREE;
  const cache: Record<string, ExpansionLayer> = {};

  if (!Array.isArray(layers) || layers.length === 0) {
    return { tree: reconstructedTree, cache };
  }

  // Katmanları derinlik (depth) sırasına göre artan düzende sırala (önce ebeveynler, sonra çocuklar)
  const sortedLayers = [...layers].sort((a, b) => (a.depth || 1) - (b.depth || 1));

  for (const layer of sortedLayers) {
    // Çift indeksleme: hem ID hem cacheKey ile kaydederek %100 önbellek isabeti sağla
    cache[layer.id] = layer;
    if (layer.cacheKey) {
      cache[layer.cacheKey] = layer;
    }

    const parentId = layer.parentId && layer.parentId.trim() ? layer.parentId : 'root';

    reconstructedTree = addNodeToTree(reconstructedTree, parentId, {
      id: layer.id,
      parentId,
      label: layer.title,
      depth: layer.depth,
      targetDisplayNumber: layer.targetDisplayNumber,
      targetBlockId: layer.targetBlockId,
      contextualQuery: layer.contextualQuery,
      isAxiomatic: layer.isAxiomatic,
      axiomType: layer.axiomType,
      layer
    });
  }

  return { tree: reconstructedTree, cache };
}
