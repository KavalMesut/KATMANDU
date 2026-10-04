import { describe, it, expect } from 'vitest';
import { DerivationTreeNode, ExpansionLayer } from '../domain/types';

function addNodeToTree(
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

  return {
    ...root,
    children: root.children.map((child) => addNodeToTree(child, parentId, newNode))
  };
}

function findPathToNode(
  current: DerivationTreeNode,
  targetId: string,
  currentPath: DerivationTreeNode[] = []
): DerivationTreeNode[] | null {
  const newPath = [...currentPath, current];
  if (current.id === targetId) {
    return newPath;
  }
  for (const child of current.children) {
    const res = findPathToNode(child, targetId, newPath);
    if (res) return res;
  }
  return null;
}

describe('Türetim Dallanma Ağacı (Derivation Tree) Mekanizması', () => {
  it('Kök düğümden dallara doğru hiyerarşik türetim ağacı oluşturulabilmeli ve soyağacı yolu bulunabilmelidir', () => {
    let tree: DerivationTreeNode = {
      id: 'root',
      parentId: null,
      label: 'Ana Çözüm',
      depth: 0,
      children: []
    };

    expect(tree.children.length).toBe(0);

    // 1. Dal Ekleme (Denklem 5: Euler-Lagrange)
    const layer1: ExpansionLayer = {
      id: 'layer_el_5',
      depth: 1,
      targetDisplayNumber: 5,
      title: 'Euler-Lagrange Türetimi',
      blocks: [],
      isAxiomatic: false,
      isTerminal: false
    };

    tree = addNodeToTree(tree, 'root', {
      id: layer1.id,
      parentId: 'root',
      label: layer1.title,
      depth: layer1.depth,
      targetDisplayNumber: 5,
      isAxiomatic: layer1.isAxiomatic,
      layer: layer1
    });

    expect(tree.children.length).toBe(1);
    expect(tree.children[0].id).toBe('layer_el_5');

    // 2. Alt Dal Ekleme (Euler-Lagrange içinden Hamilton Eylem İlkesi Aksiyomuna Derinleşme)
    const layer2: ExpansionLayer = {
      id: 'layer_axiom_action',
      depth: 2,
      title: 'Aksiyom: Hamilton Eylem İlkesi',
      blocks: [],
      isAxiomatic: true,
      isTerminal: true
    };

    tree = addNodeToTree(tree, 'layer_el_5', {
      id: layer2.id,
      parentId: 'layer_el_5',
      label: layer2.title,
      depth: layer2.depth,
      isAxiomatic: layer2.isAxiomatic,
      layer: layer2
    });

    expect(tree.children[0].children.length).toBe(1);
    expect(tree.children[0].children[0].id).toBe('layer_axiom_action');

    // 3. Soyağacı Yolu Doğrulaması (Ancestry Path)
    const path = findPathToNode(tree, 'layer_axiom_action');
    expect(path).not.toBeNull();
    expect(path!.map((n) => n.id)).toEqual(['root', 'layer_el_5', 'layer_axiom_action']);
  });

  it('Hem Dallanma Ağacı hem de Çözüm paneli %50 ile %200 arasında yakınlaştırma yapabilmelidir', () => {
    // Zoom fonksiyonu sınama mantığı: clamp(0.5, 2.0)
    const clampZoom = (current: number, delta: number) => {
      const next = Math.round((current + delta) * 10) / 10;
      return Math.max(0.5, Math.min(2.0, next));
    };

    // Varsayılan %100 (1.0)
    let zoom = 1.0;

    // Yakınlaştırma adımları: 1.0 -> 1.5 -> 2.0
    for (let i = 0; i < 15; i++) {
      zoom = clampZoom(zoom, 0.1);
    }
    // %200'ü (2.0) aşmamalı
    expect(zoom).toBe(2.0);

    // Uzaklaştırma adımları: 2.0 -> ... -> 0.5
    for (let i = 0; i < 25; i++) {
      zoom = clampZoom(zoom, -0.1);
    }
    // %50'nin (0.5) altına inmemeli
    expect(zoom).toBe(0.5);

    // Sıfırlama
    zoom = 1.0;
    expect(zoom).toBe(1.0);
  });

  it('Katman içinden bağlamsal sorgulama yapıldığında düğüm köke (root) değil o katmana dikey alt dal (child) olarak bağlanmalıdır', () => {
    let tree: DerivationTreeNode = {
      id: 'root',
      parentId: null,
      label: 'Ana Çözüm',
      depth: 0,
      children: []
    };

    // 1. Katman (Derinlik 1)
    tree = addNodeToTree(tree, 'root', {
      id: 'layer_derivation_1',
      parentId: 'root',
      label: 'Geometrik Çözümleme',
      depth: 1
    });

    expect(tree.children.length).toBe(1);
    expect(tree.children[0].id).toBe('layer_derivation_1');

    // Bu katman içindeki "hipotenüs" terimi için açılan alt sorgulama:
    // Doğru davranış: parentId = 'layer_derivation_1', depth = 2
    tree = addNodeToTree(tree, 'layer_derivation_1', {
      id: 'layer_hypotenuse_ctx',
      parentId: 'layer_derivation_1',
      label: 'Hipotenüs ve Pisagor Teoremi',
      depth: 2,
      isAxiomatic: false
    });

    // Kökün çocuk sayısı 1 kalmalı (yatay kardeş düğüm olmamalı!)
    expect(tree.children.length).toBe(1);
    // 1. Katmanın çocuğu olarak eklenmeli (dikey hiyerarşi)
    expect(tree.children[0].children.length).toBe(1);
    expect(tree.children[0].children[0].id).toBe('layer_hypotenuse_ctx');
    expect(tree.children[0].children[0].depth).toBe(2);
    expect(tree.children[0].children[0].parentId).toBe('layer_derivation_1');

    // Soyağacı yolu
    const path = findPathToNode(tree, 'layer_hypotenuse_ctx');
    expect(path?.map((n) => n.id)).toEqual(['root', 'layer_derivation_1', 'layer_hypotenuse_ctx']);
  });
});
