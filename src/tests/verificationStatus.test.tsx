import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrustedAssembler } from '../domain/trustedAssembler';
import { RawSolutionResponse } from '../domain/types';
import { getVerificationNotice } from '../domain/verification';
import { exportToLaTeX, exportMultipleToLaTeX } from '../domain/latexExporter';
import { PrintableReport } from '../components/PrintableReport';
import { PaperLayout } from '../components/PaperLayout';

const raw: RawSolutionResponse = {
  problemTitle: 'Kütle ve kuvvet', strategy: 'Newton',
  sections: [{ title: 'Sonuç', blocks: [{ kind: 'equation', latex: 'F = m + a' }] }]
};
const problem = { id: 'invalid-equation', text: 'Kütle ile kuvvet ilişkisini bulun.', createdAt: 1 };

describe('Verification provenance across reading and exports', () => {
  it('does not certify or rewrite an unchecked, dimensionally incorrect equation', () => {
    const doc = TrustedAssembler.assembleSolution(problem, raw);
    expect(doc.sections[0].blocks[0]).toMatchObject({ latex: 'F = m + a' });
    expect(doc.verification).toMatchObject({ assessmentSource: 'none', independentCheck: { status: 'not_checked' }, limitingCases: [] });
    expect(doc.verification?.dimensionalAnalysis).toBeUndefined();
    expect(JSON.stringify(doc.sections)).not.toContain('kanıtlanmıştır');
  });

  it('does not import the spring-wedge formula into a generic spring problem', () => {
    const doc = TrustedAssembler.assembleSolution({ ...problem, text: 'Bir yay üzerine etkiyen kuvvet nedir?' }, { ...raw, problemTitle: 'Yay', strategy: 'Hooke' });
    expect(doc.verification?.dimensionalAnalysis).toBeUndefined();
    expect(doc.verification?.limitingCases).toEqual([]);
    expect(JSON.stringify(doc.sections)).not.toContain('sin');
    expect(JSON.stringify(doc.verification)).not.toContain('kama');
  });

  it('keeps model explanations but does not trust a model-supplied system verdict', () => {
    const doc = TrustedAssembler.assembleSolution(problem, {
      ...raw, verification: {
        dimensionalAnalysis: 'Modelin boyut açıklaması', limitingCases: [],
        independentCheck: { status: 'passed' } as never
      }
    });
    expect(doc.verification?.dimensionalAnalysis).toBe('Modelin boyut açıklaması');
    expect(doc.verification?.assessmentSource).toBe('model');
    expect(doc.verification?.independentCheck?.status).toBe('not_checked');
  });

  it.each(['none', 'model', 'legacy'] as const)('discloses %s status in reader, print and single/merged LaTeX', source => {
    const doc = TrustedAssembler.assembleSolution(problem, raw);
    if (source === 'legacy') delete doc.verification;
    else doc.verification!.assessmentSource = source;
    const notice = getVerificationNotice(doc);
    const reader = renderToStaticMarkup(<PaperLayout document={doc} selectedEquation={null} onSelectEquation={() => {}} onContextualInquire={() => {}} />);
    const print = renderToStaticMarkup(<PrintableReport document={doc} />);
    const mergedPrint = renderToStaticMarkup(<PrintableReport documents={[{ document: doc, layers: [], maxDepth: 0 }]} />);
    for (const html of [reader, print, mergedPrint]) expect(html).toContain(notice);
    expect(exportToLaTeX(doc)).toContain(notice);
    expect(exportMultipleToLaTeX([{ document: doc, layers: [] }])).toContain(notice);
  });
});
