// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KaTeXRenderer } from '../components/KaTeXRenderer';

describe('untrusted question and solution rendering', () => {
  it.each([
    '<img src=x onerror="alert(1)"><script>alert(1)</script>',
    '$\\href{javascript:alert(1)}{click}$',
    '$\\htmlClass{injected}{x}$',
    '$\\includegraphics{https://attacker.invalid/tracker.png}$',
    '$\\unknown{<img src=x onerror="alert(1)">}$'
  ])('does not create executable HTML or remote resources from %s', content => {
    const html = renderToStaticMarkup(<KaTeXRenderer content={content} />);
    const template = document.createElement('template');
    template.innerHTML = html;
    expect(template.content.querySelector('script,img,iframe,object,embed,.injected')).toBeNull();
    for (const element of template.content.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.name.toLowerCase()).not.toMatch(/^on/);
        if (['href', 'src', 'xlink:href'].includes(attribute.name.toLowerCase())) {
          expect(attribute.value).not.toMatch(/^\s*javascript:/i);
          expect(attribute.value).not.toContain('attacker.invalid');
        }
      }
    }
  });
});
