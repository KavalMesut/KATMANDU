import { describe, it, expect } from 'vitest';
import { getDepthPalette } from '../components/InlineExpansionView';

describe('Inline Expansion Palette & In-Place Rendering Tests', () => {
  it('Derinlik 1 için nötr koyu zemin ve mavi vurgu döner', () => {
    const palette = getDepthPalette(1);
    expect(palette.lightBg).toBe('bg-[#fef9ee]');
    expect(palette.lightBorder).toBe('border-[#d97706]/60');
    expect(palette.lightBadgeText).toBe('text-[#78350f]');
    expect(palette.darkBg).toBe('dark:bg-panel');
    expect(palette.darkAccent).toBe('dark:text-spectrum-blue');
    expect(palette.darkBorder).toBe('dark:border-spectrum-blue/40');
  });

  it('Derinlik 2 için nötr koyu zemin ve yeşil vurgu döner', () => {
    const palette = getDepthPalette(2);
    expect(palette.lightBg).toBe('bg-[#f0f5fa]');
    expect(palette.lightBorder).toBe('border-[#cde0ee]');
    expect(palette.lightBadgeText).toBe('text-[#1e40af]');
    expect(palette.darkBg).toBe('dark:bg-panel');
    expect(palette.darkAccent).toBe('dark:text-spectrum-green');
  });

  it('Derinlik 3 için nötr koyu zemin ve mor vurgu döner', () => {
    const palette = getDepthPalette(3);
    expect(palette.lightBg).toBe('bg-[#eff8f3]');
    expect(palette.lightBorder).toBe('border-[#c7ebd7]');
    expect(palette.lightBadgeText).toBe('text-[#065f46]');
    expect(palette.darkBg).toBe('dark:bg-panel');
    expect(palette.darkAccent).toBe('dark:text-spectrum-violet');
  });

  it('Derinlik 4 ve üstü için nötr koyu zemin ve pembe vurgu döner', () => {
    const palette = getDepthPalette(4);
    expect(palette.lightBg).toBe('bg-[#f8f3fa]');
    expect(palette.lightBorder).toBe('border-[#e3cfee]');
    expect(palette.lightBadgeText).toBe('text-[#581c87]');
    expect(palette.darkBg).toBe('dark:bg-panel');
    expect(palette.darkAccent).toBe('dark:text-spectrum-pink');

    const palette5 = getDepthPalette(5);
    expect(palette5.lightBg).toBe('bg-[#f8f3fa]');
  });
});
