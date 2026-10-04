import { translate } from '../i18n';
import { DerivationTreeNode, EquationBlock, ExpansionLayer, SolutionDocument } from './types';
import { addNodeToTree, INITIAL_TREE, addParallelPathToTree } from './derivationTree';

export function equationCacheKey(parentId: string, equation: EquationBlock): string {
  return JSON.stringify(['equation', parentId, equation.id, equation.latex.trim()]);
}

export function contextualCacheKey(parentId: string, blockId: string | undefined, selectedText: string, userQuery?: string): string {
  return JSON.stringify(['context', parentId, blockId || 'root', selectedText.trim(), (userQuery || '').trim()]);
}

/** Restore new records and infer old parents only from actual block ownership.
 * Unknown/cyclic links stay visible as explicitly unresolved root entries.
 * Legacy contextual requests did not retain selectedText; do not invent a cache hit.
 */
export function restoreExpansions(document: SolutionDocument, saved: ExpansionLayer[]): {
  tree: DerivationTreeNode; cache: Record<string, ExpansionLayer>;
} {
  const layers = [...new Map(saved.map(layer => [layer.id, { ...layer }])).values()];
  const rootBlocks = document.sections.flatMap(section => section.blocks);
  const rootIds = new Set(['root', 'general', ...document.sections.map(s => s.id), ...rootBlocks.map(b => b.id)]);
  const knownIds = new Set(layers.map(l => l.id));
  let tree: DerivationTreeNode = INITIAL_TREE;
  for (const path of document.recommendedPaths || []) {
    if (!document.sections.some(s => s.id === `sec_${path.id}`)) continue;
    tree = addParallelPathToTree(tree, {
      id: path.id, parentId: null, label: `${path.badge || translate("2. Yol")}: ${path.methodName}`,
      depth: 0, nodeType: 'alternative_solution', pathMethodName: path.methodName
    });
  }
  const cache: Record<string, ExpansionLayer> = {};
  const attached = new Set(['root', ...(tree.parallelPaths || []).map(p => p.id)]);

  for (const layer of layers) {
    if (layer.parentLayerId === undefined && layer.parentId) layer.parentLayerId = layer.parentId;
    if (layer.parentLayerId !== undefined) continue;
    const owners = layers.filter(candidate => candidate.id !== layer.id &&
      (candidate.id === layer.targetBlockId || candidate.blocks.some(b => b.id === layer.targetBlockId)));
    if (owners.length === 1) layer.parentLayerId = owners[0].id;
    else if (owners.length === 0 && rootIds.has(layer.targetBlockId || '')) {
      const section = document.sections.find(s => s.blocks.some(b => b.id === layer.targetBlockId));
      const path = tree.parallelPaths?.find(p => section?.id === `sec_${p.id}`);
      layer.parentLayerId = path?.id || 'root';
    }
  }

  const attach = (layer: ExpansionLayer, parentId: string, unresolved = false) => {
    // Correct depth from established ancestry, preserve old depth only for unknown links.
    if (!unresolved) {
      const parent = layers.find(l => l.id === parentId);
      layer.depth = parent ? parent.depth + 1 : 1;
      const target = [...rootBlocks, ...layers.flatMap(l => l.blocks)].find(b => b.id === layer.targetBlockId);
      if (layer.requestContext) {
        layer.cacheKey = contextualCacheKey(parentId, layer.targetBlockId, layer.requestContext.selectedText, layer.requestContext.userQuery);
      } else if (!layer.contextualQuery && target?.kind === 'equation') {
        layer.cacheKey = equationCacheKey(parentId, target);
      }
    }
    // Retain duplicate/unresolved layers for display without claiming a matching request.
    const key = !unresolved && layer.cacheKey && !cache[layer.cacheKey] ? layer.cacheKey : `restored:${layer.id}`;
    cache[key] = layer;
    tree = addNodeToTree(tree, parentId, {
      id: layer.id, parentId, label: unresolved ? translate("{0} (üst bağlantısı bilinmiyor)", [layer.title]) : layer.contextualQuery || layer.title,
      depth: layer.depth, targetDisplayNumber: layer.targetDisplayNumber, targetBlockId: layer.targetBlockId,
      contextualQuery: layer.contextualQuery, isAxiomatic: layer.isAxiomatic, axiomType: layer.axiomType, layer
    });
    attached.add(layer.id);
  };

  let pending = [...layers];
  while (pending.length) {
    const ready = pending.filter(l => l.parentLayerId && attached.has(l.parentLayerId));
    if (!ready.length) break;
    for (const layer of ready) attach(layer, layer.parentLayerId!);
    pending = pending.filter(l => !attached.has(l.id));
  }
  for (const layer of pending) {
    // An absent parent must not become an invented persisted relationship.
    if (layer.parentLayerId && !knownIds.has(layer.parentLayerId)) layer.parentLayerId = undefined;
    attach(layer, 'root', true);
  }
  return { tree, cache };
}
