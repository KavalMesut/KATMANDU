// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelPicker } from '../components/ModelPicker';
import { DEFAULT_CONFIG } from '../domain/config';

const catalog = vi.hoisted(() => ({ models: [
  { id: 'anthropic/claude-one', name: 'Claude One', provider: 'openrouter' as const },
  { id: 'anthropic/claude-two', name: 'Claude Two', provider: 'openrouter' as const },
  { id: '~anthropic/claude-latest', name: 'Claude Latest', provider: 'openrouter' as const },
  { id: 'openai/gpt-one', name: 'GPT One', provider: 'openrouter' as const }
] }));

vi.mock('../domain/modelCatalog', async importOriginal => ({
  ...await importOriginal<typeof import('../domain/modelCatalog')>(),
  readCachedModels: () => catalog.models,
  fetchModelCatalog: async () => catalog.models
}));

afterEach(() => vi.unstubAllGlobals());

describe('ModelPicker şirket seçimi', () => {
  it('önce seçili modelin şirketini gösterir, başka şirket seçilince listeyi daraltır', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onChange = vi.fn();

    await act(async () => {
      root.render(<ModelPicker provider="openrouter" config={DEFAULT_CONFIG}
        value="anthropic/claude-one" onChange={onChange} />);
    });

    const company = host.querySelector<HTMLSelectElement>('select')!;
    expect(company.value).toBe('anthropic');
    expect(host.querySelectorAll('.max-h-40 button')).toHaveLength(3);
    expect([...company.options].filter(option => option.value === 'anthropic')).toHaveLength(1);
    expect([...company.options].some(option => option.value === '~anthropic')).toBe(false);
    expect(host.textContent).toContain('Güncel sürüm takma adı');

    await act(async () => {
      company.value = 'openai';
      company.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelectorAll('.max-h-40 button')).toHaveLength(1);
    expect(host.textContent).toContain('GPT One');
    expect(host.textContent).not.toContain('Claude Two');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.max-h-40 button')!.click();
    });
    expect(onChange).toHaveBeenCalledWith('openai/gpt-one', expect.objectContaining({ id: 'openai/gpt-one' }));

    await act(async () => root.unmount());
    host.remove();
  });
});
