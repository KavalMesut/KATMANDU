import { describe, it, expect } from 'vitest';
import { ExpansionLayer } from '../domain/types';
import {
  reconstructTreeFromLayers,
  deriveEquationCacheKey
} from '../domain/derivationTree';

describe('Kütüphane Türetim Ağacı ve Önbellek Korunumu (Tree & Cache Integrity)', () => {

  it('3 seviyeli derinleşme ağacını (root -> layer1 -> layer2 -> layer3) düzleştirmeden tam hiyerarşik geri yüklemelidir', () => {
    // 3 Katmanlı derinleşme zinciri
    const layer1: ExpansionLayer = {
      id: 'layer_d1_eq1',
      parentId: 'root',
      cacheKey: deriveEquationCacheKey('root', 'sec_1_b2', 'F = m a'),
      depth: 1,
      targetBlockId: 'sec_1_b2',
      targetDisplayNumber: 1,
      title: 'İvme ve Kuvvet Türetimi',
      blocks: [
        { kind: 'prose', id: 'layer_d1_b1', text: 'İvme tanımı' },
        { kind: 'equation', id: 'layer_d1_b2', latex: 'a = \\frac{dv}{dt}', displayNumber: 1 }
      ],
      isAxiomatic: false,
      isTerminal: false
    };

    const layer2: ExpansionLayer = {
      id: 'layer_d2_eq2',
      parentId: 'layer_d1_eq1', // Ebeveyni layer1!
      cacheKey: deriveEquationCacheKey('layer_d1_eq1', 'layer_d1_b2', 'a = \\frac{dv}{dt}'),
      depth: 2,
      targetBlockId: 'layer_d1_b2',
      targetDisplayNumber: 1,
      title: 'Hız ve Zaman Türevi',
      blocks: [
        { kind: 'prose', id: 'layer_d2_b1', text: 'Hızın konuma göre türevi' },
        { kind: 'equation', id: 'layer_d2_b2', latex: 'v = \\frac{dx}{dt}', displayNumber: 1 }
      ],
      isAxiomatic: false,
      isTerminal: false
    };

    const layer3: ExpansionLayer = {
      id: 'layer_d3_eq3',
      parentId: 'layer_d2_eq2', // Ebeveyni layer2!
      cacheKey: deriveEquationCacheKey('layer_d2_eq2', 'layer_d2_b2', 'v = \\frac{dx}{dt}'),
      depth: 3,
      targetBlockId: 'layer_d2_b2',
      targetDisplayNumber: 1,
      title: 'Konum Aksiyomu',
      blocks: [
        { kind: 'prose', id: 'layer_d3_b1', text: 'Öklid uzayında nokta konum aksiyomu' }
      ],
      isAxiomatic: true,
      isTerminal: true,
      axiomType: 'mathematics'
    };

    // Karışık sırada gelse bile derinlik sıralaması doğru çalışmalı
    const layers = [layer3, layer1, layer2];

    const { tree, cache } = reconstructTreeFromLayers(layers);

    // 1. Kök düğüm kontrolü: Sadece 1 doğrudan çocuk (layer1) olmalı!
    expect(tree.children.length).toBe(1);
    const node1 = tree.children[0];
    expect(node1.id).toBe(layer1.id);
    expect(node1.parentId).toBe('root');
    expect(node1.depth).toBe(1);

    // 2. İkinci seviye kontrolü: layer1'in çocuğu layer2 olmalı!
    expect(node1.children.length).toBe(1);
    const node2 = node1.children[0];
    expect(node2.id).toBe(layer2.id);
    expect(node2.parentId).toBe(layer1.id);
    expect(node2.depth).toBe(2);

    // 3. Üçüncü seviye kontrolü: layer2'nin çocuğu layer3 olmalı!
    expect(node2.children.length).toBe(1);
    const node3 = node2.children[0];
    expect(node3.id).toBe(layer3.id);
    expect(node3.parentId).toBe(layer2.id);
    expect(node3.depth).toBe(3);
    expect(node3.isAxiomatic).toBe(true);

    // 4. Çift indeksli önbellek kontrolü
    // Hem ID ile hem de cacheKey ile anında bulunabilmeli
    expect(cache[layer1.id]).toBe(layer1);
    expect(cache[layer1.cacheKey!]).toBe(layer1);

    expect(cache[layer2.id]).toBe(layer2);
    expect(cache[layer2.cacheKey!]).toBe(layer2);

    expect(cache[layer3.id]).toBe(layer3);
    expect(cache[layer3.cacheKey!]).toBe(layer3);
  });

  it('Yeniden açılan kayıtlı bir çözümde daha önce açılmış denkleme tıklandığında önbellek anahtarı eşleşerek 0 API çağrısı ile açılmalıdır', () => {
    const parentKey = 'root';
    const equationId = 'sec_1_b2';
    const latex = 'F = m a';

    const cacheKey = deriveEquationCacheKey(parentKey, equationId, latex);

    const layer: ExpansionLayer = {
      id: 'layer_restored_01',
      parentId: parentKey,
      cacheKey,
      depth: 1,
      targetBlockId: equationId,
      title: 'Newton 2. Yasası Açıklaması',
      blocks: [],
      isAxiomatic: true,
      isTerminal: true
    };

    const { cache } = reconstructTreeFromLayers([layer]);

    // Kullanıcı denkleme tıkladığında aynı deriveEquationCacheKey ile arar:
    const lookupKey = deriveEquationCacheKey(parentKey, equationId, latex);

    // Önbellekte birebir bulunmalıdır (0 network call!)
    expect(cache[lookupKey]).toBeDefined();
    expect(cache[lookupKey].id).toBe('layer_restored_01');
    expect(cache[lookupKey].title).toBe('Newton 2. Yasası Açıklaması');
  });

  it('Eski sürümlerden kalan parentId ve cacheKey alanı olmayan legacy kayıtlarda geriye dönük uyumluluğu korumalıdır', () => {
    const legacyLayer: ExpansionLayer = {
      id: 'legacy_layer_99',
      depth: 1,
      title: 'Eski Kayıt Katmanı',
      blocks: [],
      isAxiomatic: false,
      isTerminal: false
      // parentId ve cacheKey tanımsız!
    };

    const { tree, cache } = reconstructTreeFromLayers([legacyLayer]);

    expect(tree.children.length).toBe(1);
    expect(tree.children[0].id).toBe('legacy_layer_99');
    expect(tree.children[0].parentId).toBe('root');

    // ID ile önbellekten erişilebilmeli
    expect(cache['legacy_layer_99']).toBeDefined();
    expect(cache['legacy_layer_99'].title).toBe('Eski Kayıt Katmanı');
  });
});
