// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockView } from '../components/BlockView';
import { InlineExpansionView } from '../components/InlineExpansionView';
import type { EquationBlock, ExpansionLayer } from '../domain/types';

let root: Root;
let host: HTMLDivElement;
const equation: EquationBlock = { id: 'eq', kind: 'equation', latex: 'F=ma' };
const layer: ExpansionLayer = { id: 'layer', depth: 1, title: 'Derivation', blocks: [equation], isAxiomatic: false, isTerminal: false };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

for (const nested of [false, true]) {
  describe(nested ? 'Nested touch derivation' : 'Root touch derivation', () => {
    const render = async (onSelect: (eq: EquationBlock) => void, busy = false, expandable = true) => {
      const block = { ...equation, expandable };
      await act(async () => root.render(nested
        ? <InlineExpansionView layer={{ ...layer, blocks: [block] }} isOpen onToggle={() => {}} layersByTargetId={{}} openLayerIds={new Set()} onToggleLayer={() => {}} expandingBlockId={busy ? block.id : null} onSelectEquation={onSelect} />
        : <BlockView block={block} isExpandingThisBlock={busy} onSelectEquation={onSelect} />));
    };
    it('opens the selected equation with one tap and prevents repeated taps while loading', async () => {
      const onSelect = vi.fn(); await render(onSelect);
      const button = host.querySelector<HTMLButtonElement>('.touch-derivation-control')!;
      expect(button.textContent).toContain('Türetimi aç');
      await act(async () => button.click());
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith({ ...equation, expandable: true });
      await render(onSelect, true);
      const loadingButton = host.querySelector<HTMLButtonElement>('.touch-derivation-control')!;
      expect(loadingButton.disabled).toBe(true);
      await act(async () => loadingButton.click());
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    it('does not offer expansion for a non-expandable equation', async () => {
      await render(vi.fn(), false, false);
      expect(host.querySelector('.touch-derivation-control')).toBeNull();
    });
  });
}
