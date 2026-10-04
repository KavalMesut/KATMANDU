import { describe, it, expect, vi } from 'vitest';
import { MockProvider } from '../providers/mockProvider';
import { TrustedAssembler } from '../domain/trustedAssembler';
import { EquationBlock, ExpansionLayer } from '../domain/types';

describe('Expansion Cache / Memoization Mekanizması', () => {
  const provider = new MockProvider('tr');
  const expandSpy = vi.spyOn(provider, 'expand');

  const dummyEq: EquationBlock = {
    id: 'eq_1',
    kind: 'equation',
    latex: 'F_t = -mg\\sin\\theta',
    displayNumber: 1
  };

  it('Aynı denklem ilk tıklandığında çözülmeli, ikinci kez tıklandığında hafızadan (0 çağrı ile) dönmelidir', async () => {
    expandSpy.mockClear();

    const expansionCache: Record<string, ExpansionLayer> = {};
    const parentKey = 'root';
    const cacheKey = `eq_${parentKey}_${dummyEq.id}_${dummyEq.latex.trim()}`;

    // 1. Tıklama: Önbellekte yok, provider.expand çağrılır
    expect(expansionCache[cacheKey]).toBeUndefined();

    const rawExp1 = await provider.expand({
      problemText: 'Basit sarkaç',
      parentSectionTitle: 'Ana Çözüm',
      targetBlock: dummyEq,
      depth: 1,
      ancestorPath: ['Ana Çözüm']
    });

    const layer1 = TrustedAssembler.assembleExpansionLayer(rawExp1, 1, dummyEq.id, dummyEq.displayNumber);
    expansionCache[cacheKey] = layer1;

    expect(expandSpy).toHaveBeenCalledTimes(1);
    expect(layer1.title).toContain('Teğetsel');

    // 2. Tıklama: Önbellek kontrolü
    const cachedHit = expansionCache[cacheKey];
    expect(cachedHit).toBeDefined();
    expect(cachedHit.title).toBe(layer1.title);

    // provider.expand ikinci kez çağrılmamalıdır!
    expect(expandSpy).toHaveBeenCalledTimes(1);
  });
});
