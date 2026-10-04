import { describe, it, expect } from 'vitest';
import { MockProvider } from '../providers/mockProvider';
import { TrustedAssembler } from '../domain/trustedAssembler';
import { ProblemInput } from '../domain/types';

describe('MockProvider & Gelişmiş Derinleşme Senaryoları', () => {
  const provider = new MockProvider('tr');
  const pendulumProblem: ProblemInput = {
    id: 'pendulum_001',
    text: 'Basit sarkaç salınım periyodunu türetiniz.',
    createdAt: Date.now()
  };

  it('Basit sarkaç ana çözümü eksiksiz ve atomik denklemlerle üretilmelidir', async () => {
    const raw = await provider.solve(pendulumProblem);
    const doc = TrustedAssembler.assembleSolution(pendulumProblem, raw);

    expect(doc.problemTitle.toLowerCase()).toContain('sarkaç');
    expect(doc.sections.length).toBeGreaterThanOrEqual(4);
    expect(doc.totalEquations).toBeGreaterThanOrEqual(4);

    // Ana çözüm diyagramı
    const firstSection = doc.sections[0];
    const diagram = firstSection.blocks.find((b) => b.kind === 'diagram');
    expect(diagram).toBeDefined();
    if (diagram && diagram.kind === 'diagram') {
      expect(diagram.status).toBe('rendered');
      expect(diagram.spec.elements.length).toBeGreaterThan(0);
    }
  });

  it('Her katmanda şekil çizimi zorlanmalı ve Derinlik 1-3 boyunca diyagram üretilmelidir (Requirement 1)', async () => {
    const rawDoc = await provider.solve(pendulumProblem);
    const doc = TrustedAssembler.assembleSolution(pendulumProblem, rawDoc);

    const motionSection = doc.sections[1];
    const tangentEq = motionSection.blocks.find(
      (b) => b.kind === 'equation' && b.latex.includes('F_t')
    );
    expect(tangentEq).toBeDefined();

    if (tangentEq && tangentEq.kind === 'equation') {
      // Derinlik 1: FBD ve Teğetsel Kuvvet İzdüşümü Şeması
      const rawExp1 = await provider.expand({
        problemText: doc.problemText,
        parentSectionTitle: motionSection.title,
        targetBlock: tangentEq,
        depth: 1,
        ancestorPath: ['Ana Çözüm']
      });

      const layer1 = TrustedAssembler.assembleExpansionLayer(
        rawExp1,
        1,
        tangentEq.id,
        tangentEq.displayNumber
      );

      expect(layer1.depth).toBe(1);
      const diag1 = layer1.blocks.find((b) => b.kind === 'diagram');
      expect(diag1).toBeDefined(); // Katman 1'de şekil var!

      // Derinlik 2: Birim Vektör Geometrisi Şeması
      const secondEq = layer1.blocks.find(
        (b) => b.kind === 'equation' && b.latex.includes('\\vec{e}_t')
      );
      expect(secondEq).toBeDefined();

      if (secondEq && secondEq.kind === 'equation') {
        const rawExp2 = await provider.expand({
          problemText: doc.problemText,
          parentSectionTitle: layer1.title,
          targetBlock: secondEq,
          depth: 2,
          ancestorPath: ['Ana Çözüm', layer1.title]
        });

        const layer2 = TrustedAssembler.assembleExpansionLayer(
          rawExp2,
          2,
          secondEq.id,
          secondEq.displayNumber
        );

        expect(layer2.depth).toBe(2);
        const diag2 = layer2.blocks.find((b) => b.kind === 'diagram');
        expect(diag2).toBeDefined(); // Katman 2'de şekil var!
      }
    }
  });

  it('Katmanlar aksiyomlara kadar inmeli ve Newton 2. Yasasında isAxiomatic işaretlenmelidir (Requirement 2)', async () => {
    const rawExp3 = await provider.expand({
      problemText: 'Basit sarkaç',
      parentSectionTitle: 'Kutupsal Koordinatlar',
      targetBlock: { id: 'eq_test', kind: 'equation', latex: 'm\\vec{a} = \\sum \\vec{F}' },
      depth: 3,
      ancestorPath: ['Ana Çözüm', 'Teğetsel Kuvvet', 'Kutupsal Koordinatlar']
    });

    const layer3 = TrustedAssembler.assembleExpansionLayer(
      rawExp3,
      3,
      'eq_test',
      4
    );

    expect(layer3.depth).toBe(3);
    expect(layer3.isAxiomatic).toBe(true);
    expect(layer3.isTerminal).toBe(true);
    expect(layer3.title).toContain('Aksiyom');

    const diag3 = layer3.blocks.find((b) => b.kind === 'diagram');
    expect(diag3).toBeDefined(); // Aksiyom katmanında da momentum diyagramı var
  });

  it('Serbest metin seçimi bağlamı koruyarak alt katman açıklaması üretmelidir (Requirement 3)', async () => {
    const contextualExp = await provider.expand({
      problemText: 'Basit sarkaç salınımı',
      parentSectionTitle: 'Küçük Açı Yaklaşımı',
      contextualInquiry: {
        selectedText: 'Taylor serisi',
        userQuery: 'Bu açılım neden küçük açılarda geçerlidir?'
      },
      depth: 1,
      ancestorPath: ['Ana Çözüm']
    });

    const layer = TrustedAssembler.assembleExpansionLayer(
      contextualExp,
      1,
      undefined,
      undefined,
      'Taylor serisi'
    );

    expect(layer.title).toContain('Taylor');
    expect(layer.contextualQuery).toBe('Taylor serisi');
    expect(layer.blocks.length).toBeGreaterThan(0);
    const diag = layer.blocks.find((b) => b.kind === 'diagram');
    expect(diag).toBeDefined();
  });
});
