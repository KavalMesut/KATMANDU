import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KaTeXRenderer } from '../components/KaTeXRenderer';
import { normalizeInlineMath } from '../domain/inlineMath';
import { escapeLaTeXText } from '../domain/latexExporter';

describe('paragraf içi matematik', () => {
  it('çıplak LaTeX sembollerini işaretler ve mevcut matematik alanlarını korur', () => {
    const text = 'Koordinatlar \\rho   \\phi ve $\\theta$; kod `\\rho`.';
    expect(normalizeInlineMath(text)).toBe('Koordinatlar $\\rho$   $\\phi$ ve $\\theta$; kod `\\rho`.');
  });

  it('kayıtlı paragraftaki sembolleri ekranda KaTeX olarak gösterir', () => {
    const html = renderToStaticMarkup(<KaTeXRenderer content={'Yarıçap \\rho ve açı \\phi.'} />);
    expect(html).toContain('katex');
    expect(html).toContain('ρ');
    expect(html).toContain('ϕ');
    expect(html).not.toContain('Yarıçap \\rho');
  });

  it('LaTeX dışa aktarımında sembolleri matematik kipine alır', () => {
    expect(escapeLaTeXText('Yarıçap \\rho ve açı \\phi.')).toContain('$\\rho$ ve açı $\\phi$');
  });
});
