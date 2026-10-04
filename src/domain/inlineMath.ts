const mathSegment = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|`[^`]*`)/g;
const bareMathSymbol = /\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|infty|nabla|partial)\b/g;

/** Wrap known standalone LaTeX symbols without changing existing math spans. */
export function normalizeInlineMath(text: string): string {
  return text.split(mathSegment).map((part) => {
    if (/^(?:\$|\\\(|\\\[|`)/.test(part)) return part;
    return part.replace(bareMathSymbol, (symbol) => `$${symbol}$`);
  }).join('');
}
