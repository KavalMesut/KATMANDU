import { describe, it, expect } from 'vitest';
import { MockProvider } from '../providers/mockProvider';
import { TrustedAssembler } from '../domain/trustedAssembler';

describe('Disciplinary Leap: Hypotenuse and Mathematical Theorem', () => {
  const provider = new MockProvider('tr');

  it('MockProvider returns hypotenuse fixture on contextual inquiry for "hipotenüs" as a proven theorem (not axiom)', async () => {
    const res = await provider.expand({
      problemText: 'Basit sarkaç hareketi',
      parentSectionTitle: 'Kuvvet Analizi',
      depth: 1,
      ancestorPath: ['Ana Çözüm'],
      contextualInquiry: {
        selectedText: 'hipotenüs',
        userQuery: 'Bu terimi ve nereden geldiğini açıkla'
      }
    });

    expect(res.title).toContain('Hipotenüs ve Pisagor Teoremi');
    // Hipotenüs ve Pisagor bağıntısı ispatlanabilir bir geometrik teoremdir, doğrudan aksiyom değildir
    expect(res.isAxiomatic).toBe(false);
    expect(res.isTerminal).toBe(false);

    // Diyagram doğrulaması (dik üçgen ve polygon)
    expect(res.diagram).toBeDefined();
    expect(res.diagram?.elements.some((el) => el.type === 'polygon')).toBe(true);
    expect(res.diagram?.elements.some((el) => el.type === 'line' && el.label?.includes('hipotenüs'))).toBe(true);

    // İspat blokları
    const eqBlocks = res.blocks.filter((b) => b.kind === 'equation');
    expect(eqBlocks.length).toBeGreaterThanOrEqual(2);
    expect(eqBlocks.some((b) => 'latex' in b && b.latex.includes('a^2 + b^2 = c^2'))).toBe(true);
    expect(eqBlocks.some((b) => 'latex' in b && b.latex.includes('(a + b)^2'))).toBe(true);
  });

  it('MockProvider returns hypotenuse fixture when targetBlock contains hypotenuse or pythagorean formula', async () => {
    const res = await provider.expand({
      problemText: 'Basit sarkaç',
      parentSectionTitle: 'Geometri',
      depth: 2,
      ancestorPath: ['Ana Çözüm', 'Geometrik İzdüşüm'],
      targetBlock: {
        id: 'blk_1',
        kind: 'equation',
        latex: 'a^2 + b^2 = c^2'
      }
    });

    expect(res.isAxiomatic).toBe(false);
    expect(res.isTerminal).toBe(false);
    expect(res.title).toContain('Hipotenüs');
  });

  it('TrustedAssembler correctly labels proven theorems as isAxiomatic: false', () => {
    const raw = MockProvider.getHypotenuseFixture();
    const assembled = TrustedAssembler.assembleExpansionLayer(raw, 2, 'hypo_layer');

    expect(assembled.isAxiomatic).toBe(false);
    expect(assembled.isTerminal).toBe(false);
    expect(assembled.blocks.length).toBeGreaterThan(0);
  });

  it('TrustedAssembler infers mathematics axiomType from geometry keywords when axiomType is missing', () => {
    const rawWithoutType = {
      title: 'Öklid Geometrisi Aksiyomu',
      explanation: 'Düzlem geometride paralellik postulatı',
      isAxiomatic: true,
      blocks: [
        { kind: 'prose' as const, text: 'Öklid aksiyomları...' }
      ]
    };

    const assembled = TrustedAssembler.assembleExpansionLayer(rawWithoutType, 3, 'geo_layer');
    expect(assembled.isAxiomatic).toBe(true);
    expect(assembled.axiomType).toBe('mathematics');
  });

  it('TrustedAssembler defaults to physics for Newton law when axiomType is missing', () => {
    const rawPhysics = {
      title: 'Aksiyom: Newton’un 2. Hareket Yasası',
      explanation: 'Klasik mekaniğin kurucu doğa yasası',
      isAxiomatic: true,
      blocks: [
        { kind: 'prose' as const, text: 'F = ma...' }
      ]
    };

    const assembled = TrustedAssembler.assembleExpansionLayer(rawPhysics, 3, 'phys_layer');
    expect(assembled.isAxiomatic).toBe(true);
    expect(assembled.axiomType).toBe('physics');
  });
});
