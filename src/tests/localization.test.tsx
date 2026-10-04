// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { getLanguage, getLocale, setLanguage, translate, translateDemoData } from '../i18n';
import english from '../i18n/en.json';
import { SettingsModal } from '../components/SettingsModal';
import { ExecutionReportPanel } from '../components/ExecutionReportPanel';
import { SectionView } from '../components/SectionView';
import { COMMON_SYMBOL_MEANINGS, getSymbolMeaning } from '../components/KaTeXRenderer';
import { DEFAULT_CONFIG } from '../domain/config';
import { deriveDisciplineAndCategory } from '../domain/libraryStorage';
import { TrustedAssembler, isTheoryOrConceptTopic, isPureMathProblem } from '../domain/trustedAssembler';
import { exportToLaTeX, exportMultipleToLaTeX } from '../domain/latexExporter';
import { buildQuestionDetectionPrompt, buildSubpartSolutionInstruction, detectMultipleQuestions } from '../domain/questionParser';
import { createProviderSession, createSessionForSavedSolution } from '../providers/providerSession';
import type { ExpansionRequest, ProblemInput } from '../domain/types';

const turkishCharacters = /[çğıöşüÇĞİÖŞÜ]/;
const problem: ProblemInput = { id: 'language-test', text: 'Derive the equation of motion for an ideal pendulum.', createdAt: 0 };
const expansion: ExpansionRequest = {
  problemText: problem.text, parentSectionTitle: 'Equation of motion', depth: 1, ancestorPath: [],
  targetBlock: { id: 'eq1', kind: 'equation', displayNumber: 1, latex: '\\ddot{\\theta} + \\frac{g}{L}\\sin\\theta = 0' }
};
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; host?.remove(); host = undefined;
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('English default and Turkish language support', () => {
  it('switches the mounted settings immediately, persists the choice and updates page language', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    setLanguage('en');
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(<SettingsModal isOpen config={{ ...DEFAULT_CONFIG, activeProvider: 'mock', modelSelectionMode: 'auto' }} onClose={() => {}} onSaveConfig={() => {}} />));
    expect(host.textContent).toContain('Settings');
    expect(host.textContent).toContain('Language');
    expect(host.querySelector('#model-selection-mode')).toBeNull();
    expect(host.querySelector('#recommendation-provider')).toBeNull();
    const select = host.querySelector<HTMLSelectElement>('#app-language')!;
    expect(select.value).toBe('en');
    await act(async () => { select.value = 'tr'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.textContent).toContain('Model ve API Yapılandırması');
    expect(host.textContent).toContain('Kaydet');
    expect(getLocale()).toBe('tr-TR');
    expect(localStorage.getItem('katmandu_language_v1')).toBe('tr');
    expect(document.documentElement.lang).toBe('tr');
    await act(async () => { select.value = 'en'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.textContent).toContain('Save');
    expect(getLocale()).toBe('en-US');
    expect(localStorage.getItem('katmandu_language_v1')).toBe('en');
  });

  it.each(['openai', 'gemini', 'deepseek', 'openrouter'] as const)('%s gives an English missing-key error without selecting demo or making an HTTP call', provider => {
    setLanguage('en'); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const session = createProviderSession({ ...DEFAULT_CONFIG, activeProvider: provider, [`${provider}ApiKey`]: '   ' });
    expect(session.error).toContain('API key');
    expect(session.error).not.toMatch(turkishCharacters);
    expect(session.provider).toBeNull(); expect(session.isDemo).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  for (const provider of ['openai', 'gemini', 'deepseek', 'openrouter'] as const) {
    for (const language of ['en', 'tr'] as const) {
      it.each(['solve', 'detectQuestions', 'expand'] as const)(`${provider} %s captures ${language} for the entire operation`, async method => {
        setLanguage(language);
        let finish!: (response: Response) => void;
        const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
        vi.stubGlobal('fetch', fetch);
        const config = { ...DEFAULT_CONFIG, activeProvider: provider, [`${provider}ApiKey`]: 'test-key', language };
        const session = createProviderSession(config);
        const pending = method === 'expand' ? session.provider!.expand(expansion) : session.provider![method]!(problem);
        for (let i = 0; i < 20 && !fetch.mock.calls.length; i++) await Promise.resolve();
        expect(fetch).toHaveBeenCalledTimes(1);
        const init = (fetch.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
        const sent = JSON.parse(String(init.body));
        const prompt = JSON.stringify(sent);
        expect(prompt).toContain('Detect the language of the supplied question automatically');
        expect(prompt).toContain(`in ${language === 'en' ? 'English' : 'Turkish'}`);
        expect(prompt).not.toContain('SADECE TÜRKÇE');
        expect(prompt).not.toContain('İSTİSNASIZ TÜRKÇE');
        config.language = language === 'en' ? 'tr' : 'en'; setLanguage(config.language);
        const text = JSON.stringify({ problemTitle: 'Result', strategy: '', sections: [], title: 'Derivation', explanation: '', blocks: [], questions: [{ questionNumber: 1 }] });
        finish(new Response(JSON.stringify({ choices: [{ message: { content: text } }], candidates: [{ content: { parts: [{ text }] } }], output_text: text }), { status: 200 }));
        const result = await pending;
        if (method === 'detectQuestions') expect((result as Array<{title: string}>)[0].title).toBe(language === 'en' ? 'Question 1' : 'Soru 1');
        const metadata = session.createMetadata();
        expect(metadata.language).toBe(language);
        expect(session.fork().createMetadata().language).toBe(language);
        expect(session.fork(config.language).createMetadata().language).toBe(config.language);
        expect(createSessionForSavedSolution(config, metadata)?.createMetadata().language).toBe(language);
      });
    }
  }

  it.each(['ideal pendulum', 'spring wedge', 'moving wedge', 'Lagrange constraint', 'generalized coordinates'])('prepared English demo has no Turkish text: %s', async text => {
    setLanguage('en'); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const session = createProviderSession({ ...DEFAULT_CONFIG, activeProvider: 'mock' });
    const result = await session.provider!.solve({ ...problem, text });
    expect(JSON.stringify(result)).not.toMatch(turkishCharacters);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(session.createMetadata().providerName).toContain('Offline Demo');
    expect(session.createMetadata().language).toBe('en');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('localizes demo expansions while keeping axiom and equation identifiers stable', async () => {
    setLanguage('en');
    const provider = createProviderSession({ ...DEFAULT_CONFIG, activeProvider: 'mock' }).provider!;
    for (const selectedText of ['Pythagorean theorem', 'Conservation of energy', 'Newton and inertia', 'Equilibrium and stability', 'Inductance']) {
      const result = await provider.expand({ ...expansion, contextualInquiry: { selectedText, userQuery: selectedText } });
      expect(JSON.stringify(result)).not.toMatch(turkishCharacters);
      if (result.axiomType) expect(['physics', 'mathematics']).toContain(result.axiomType);
    }
    expect(translateDemoData({ id: 'physics', axiomType: 'physics', text: 'Kütle' }, 'tr')).toMatchObject({ id: 'physics', axiomType: 'physics' });
  });

  it('recognizes English questions, mathematical topics, classifications and verification sections', () => {
    setLanguage('en');
    expect(detectMultipleQuestions('Question 1: Integrate x.\nQuestion 2: Find the eigenvalues.')).toHaveLength(2);
    expect(detectMultipleQuestions('Find x.\na) Derive.\nb) Verify.')).toHaveLength(1);
    expect(isTheoryOrConceptTopic('An atlas of generalized coordinates')).toBe(true);
    expect(isPureMathProblem('Prove a theorem for a triangle')).toBe(true);
    expect(deriveDisciplineAndCategory('Matrix eigenvalues', 'Find eigenvectors')).toMatchObject({ discipline: 'matematik', category: 'Linear Algebra' });
    const html = renderToStaticMarkup(<SectionView sectionIndex={0} section={{ id: 'verify', title: 'Verification and dimensional analysis', blocks: [] }} />);
    expect(html).toContain(translate('Sağlama Açıklaması · Kontrol edilmedi'));
    expect(buildQuestionDetectionPrompt('en')).toContain('INDEPENDENT QUESTIONS');
    expect(buildSubpartSolutionInstruction('a) Derive.\nb) Verify.', 'en')).toContain('a), b)');
    expect(buildSubpartSolutionInstruction('', 'en')).toContain('\\boxed{...}');
  });

  it('keeps synthesized solution content in the captured language after a UI language change', () => {
    setLanguage('tr');
    const document = TrustedAssembler.assembleSolution(problem, {
      problemTitle: 'Pendulum', strategy: 'Newton dynamics', sections: [],
      recommendedPaths: [{ id: 'alt', description: '', methodName: 'Alternative', query: '' }]
    }, { providerName: 'OpenAI', modelName: 'test-model', solvedAt: 0, language: 'en' });
    expect(JSON.stringify(document)).not.toMatch(turkishCharacters);
    expect(document.recommendedPaths?.[0].badge).toBe('⚡ Method 2');
  });

  it('renders English mathematical tooltips, including context disambiguation', () => {
    setLanguage('en');
    for (const symbol of Object.keys(COMMON_SYMBOL_MEANINGS)) expect(getSymbolMeaning(symbol)).not.toMatch(turkishCharacters);
    expect(getSymbolMeaning('L', 'A pendulum suspended by a string')).toBe('String Length (L)');
    expect(getSymbolMeaning('L', 'Inductance in an RLC circuit')).toContain('Inductance');
    expect(getSymbolMeaning('k', 'Boltzmann entropy')).toBe('Boltzmann Constant (k)');
  });

  it('uses the chosen language for both single and combined exports, preserving archived content', async () => {
    setLanguage('en');
    const session = createProviderSession({ ...DEFAULT_CONFIG, activeProvider: 'mock' });
    const document = TrustedAssembler.assembleSolution(problem, await session.provider!.solve(problem), session.createMetadata());
    document.problemText = 'Eski kayıt: değişmeden kalmalı.';
    const original = JSON.stringify(document);
    const englishExport = exportToLaTeX(document);
    expect(englishExport).toContain('shorthands=off,english');
    expect(englishExport).toContain('Solution Strategy');
    expect(englishExport).not.toContain('Çözüm Stratejisi');
    const combined = exportMultipleToLaTeX([{ document }, { document }]);
    expect(combined).toContain('Combined Problem Solutions');
    expect(combined).toContain('Problem List and Layer Summary');
    setLanguage('tr');
    const turkishExport = exportToLaTeX(document);
    expect(turkishExport).toContain('shorthands=off,turkish');
    expect(turkishExport).toContain('Çözüm Stratejisi');
    expect(JSON.stringify(document)).toBe(original);
  });

  it('renders a complete English execution report when reasoning and usage are unavailable', () => {
    setLanguage('en');
    const usage = { inputTokens: null, outputTokens: null, totalTokens: null, reportedCalls: 0, unreportedCalls: 1 };
    const html = renderToStaticMarkup(<ExecutionReportPanel report={{ durationMs: 1000, totalUsage: usage,
      runs: [{ role: 'solution', providerName: 'OpenAI', modelName: 'test-model', usage }] }} />);
    expect(html).toContain('level not reported');
    expect(html).not.toContain('seviye belirtilmedi');
    expect(html).not.toMatch(turkishCharacters);
  });

  it('covers all translated call sites and preserves interpolation placeholders', () => {
    const catalog: Record<string, string> = english;
    const walk = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap(item => item.isDirectory()
      ? ['tests', 'i18n'].includes(item.name) ? [] : walk(path.join(folder, item.name))
      : /\.tsx?$/.test(item.name) ? [path.join(folder, item.name)] : []);
    const missing: string[] = [];
    for (const file of [...walk('src'), ...walk('server')]) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && /(?:^|\.)translate$/.test(node.expression.getText(source))) {
          const [message, values] = node.arguments;
          if (message && ts.isStringLiteralLike(message)) {
            if (!catalog[message.text]) missing.push(`${file}: ${message.text}`);
            else if (values && ts.isArrayLiteralExpression(values)) {
              const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\d+)\}/g)].map(match => match[1]))].sort();
              expect(placeholders(catalog[message.text]), message.text).toEqual(placeholders(message.text));
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(missing).toEqual([]);
    for (const text of Object.values(catalog)) expect(text).not.toMatch(turkishCharacters);
  });

  it('defaults to English with no preference and restores a saved Turkish preference', async () => {
    localStorage.clear(); vi.resetModules();
    expect((await import('../i18n')).getLanguage()).toBe('en');
    localStorage.setItem('katmandu_language_v1', 'tr'); vi.resetModules();
    expect((await import('../i18n')).getLanguage()).toBe('tr');
    expect(getLanguage()).toBeDefined();
  });
});
