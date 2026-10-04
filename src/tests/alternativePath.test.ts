import { describe, it, expect } from 'vitest';
import { TrustedAssembler, synthesizeContextualRecommendedPaths } from '../domain/trustedAssembler';
import {
  INITIAL_TREE,
  addNodeToTree,
  addParallelPathToTree,
  findPathToNode
} from '../domain/derivationTree';
import { ProblemInput, RawSolutionResponse, SolutionBlock, SolutionSection } from '../domain/types';
import { MockProvider } from '../providers/mockProvider';

describe('Alternative Pathways & Parallel Tree Branches (2. ve 3. Yol - Zorlama Yok)', () => {
  const dummyProblem: ProblemInput = {
    id: 'test_prob_alt',
    text: 'Sürtünmesiz hareketli kama ve üzerindeki yaylı blok sistemi (Problem 7.34)',
    createdAt: Date.now()
  };

  it('1. Modelden gelen recommendedPaths dizisini güvenle normalize eder ve dokümana ekler', () => {
    const rawWithPaths: RawSolutionResponse = {
      problemTitle: 'Yaylı Hareketli Kama',
      problemText: 'Yaylı kama sistemi',
      strategy: 'Lagrange mekaniği ile çözüm',
      sections: [
        {
          title: 'Euler-Lagrange Denklemleri',
          blocks: [
            { kind: 'prose', text: 'Lagrangian kurulur.' },
            { kind: 'equation', latex: 'L = T - V', explanation: 'Lagrange Fonksiyonu' }
          ]
        }
      ],
      recommendedPaths: [
        {
          id: 'path_2',
          methodName: "Newton / d'Alembert Dinamiği",
          badge: '⚡ 2. Yol: Vektörel Dinamik',
          description: 'Serbest cisim diyagramı ve eylemsizlik kuvvetleriyle doğrudan türetim.',
          query: 'Bu problemi Newton dinamiği ve FBD ile baştan çözünüz.'
        }
      ]
    };

    const doc = TrustedAssembler.assembleSolution(dummyProblem, rawWithPaths);

    expect(doc.recommendedPaths).toBeDefined();
    expect(doc.recommendedPaths?.length).toBe(1);
    expect(doc.recommendedPaths?.[0].id).toBe('path_2');
    expect(doc.recommendedPaths?.[0].methodName).toBe("Newton / d'Alembert Dinamiği");
    expect(doc.recommendedPaths?.[0].solved).toBe(false);
  });

  it('2. Model tavsiye dönmediğinde fakat problemde bariz 2. yol varsa (Lagrange -> Newton) bağlamsal sentezler', () => {
    const rawWithoutPaths: RawSolutionResponse = {
      problemTitle: 'Yaylı Kama Küçük Salınımları',
      problemText: 'Yaylı eğik düzlem kama sistemi',
      strategy: 'Genelleştirilmiş koordinatlar ve Euler-Lagrange denklemleri',
      sections: [
        {
          title: 'Hareket Denklemleri',
          blocks: [{ kind: 'equation', latex: 'm\\ddot{x} = ...' }]
        }
      ]
    };

    const doc = TrustedAssembler.assembleSolution(dummyProblem, rawWithoutPaths);

    expect(doc.recommendedPaths).toBeDefined();
    expect(doc.recommendedPaths?.length).toBeGreaterThan(0);
    expect(doc.recommendedPaths?.[0].methodName).toContain("Newton / d'Alembert");
  });

  it('3. Saf matematik integral problemlerinde Feynman parametrik türev tavsiyesi üretir', () => {
    const mathProblem: ProblemInput = {
      id: 'math_int_prob',
      text: 'f(x) = \\int_0^\\infty \\frac{\\sin x}{x} dx Dirichlet integralini hesaplayınız.',
      createdAt: Date.now()
    };

    const rawMath: RawSolutionResponse = {
      problemTitle: 'Dirichlet İntegrali Hesabı',
      problemText: 'Dirichlet integrali',
      strategy: 'Kalıntı teoremi ve kontur integrali',
      sections: [
        {
          title: 'İntegrasyon Adımları',
          blocks: [{ kind: 'equation', latex: '\\int_0^\\infty \\frac{\\sin x}{x} dx = \\frac{\\pi}{2}' }]
        }
      ]
    };

    const doc = TrustedAssembler.assembleSolution(mathProblem, rawMath);

    expect(doc.recommendedPaths).toBeDefined();
    expect(doc.recommendedPaths?.[0].methodName).toContain('Feynman Parametrik Türev');
    expect(doc.recommendedPaths?.[0].badge).toContain('Feynman');
  });

  it('4. Bariz bir ikinci yolu olmayan genel sorularda zorlama yapmaz (Zorlama Yok kuralı)', () => {
    const genericProblem: ProblemInput = {
      id: 'generic_prob',
      text: 'Bir cisim 10 m yükseklikten serbest bırakılıyor.',
      createdAt: Date.now()
    };

    const synthesized = synthesizeContextualRecommendedPaths(
      genericProblem.text,
      'Serbest Düşme',
      'Standart kinematik denklem',
      false
    );

    expect(synthesized).toBeUndefined();
  });

  it('5. Ağaç mimarisinde 2. Yol aynı katman seviyesinde (depth: 0) paralel kök olarak eklenir', () => {
    let tree = INITIAL_TREE;
    expect(tree.depth).toBe(0);
    expect(tree.label).toBe('1. Yol: Ana Çözüm');

    // 2. Yolu paralel kök olarak ekle
    tree = addParallelPathToTree(tree, {
      id: 'path_2',
      parentId: null,
      label: "2. Yol: Newton / d'Alembert Dinamiği",
      depth: 0,
      nodeType: 'alternative_solution',
      pathMethodName: "Newton / d'Alembert Dinamiği"
    });

    expect(tree.parallelPaths).toBeDefined();
    expect(tree.parallelPaths?.length).toBe(1);

    const path2Node = tree.parallelPaths?.[0];
    expect(path2Node?.id).toBe('path_2');
    expect(path2Node?.depth).toBe(0); // AYNI KATMAN SEVİYESİNDE!
    expect(path2Node?.nodeType).toBe('alternative_solution');

    // 2. Yol altına denklem derinleşmesi (drilldown) eklendiğinde doğrudan path_2 altına dallanır
    tree = addNodeToTree(tree, 'path_2', {
      id: 'layer_path2_fbd',
      parentId: 'path_2',
      label: 'Eylemsizlik Kuvveti Detayı',
      depth: 1
    });

    const updatedPath2 = tree.parallelPaths?.[0];
    expect(updatedPath2?.children.length).toBe(1);
    expect(updatedPath2?.children[0].id).toBe('layer_path2_fbd');
    expect(updatedPath2?.children[0].depth).toBe(1);

    // findPathToNode hem ana çözümü hem paralel kökü ve onun çocuklarını bulabilmelidir
    const pathToRoot = findPathToNode(tree, 'root');
    expect(pathToRoot?.length).toBe(1);
    expect(pathToRoot?.[0].id).toBe('root');

    const pathToPath2 = findPathToNode(tree, 'path_2');
    expect(pathToPath2?.length).toBe(1);
    expect(pathToPath2?.[0].id).toBe('path_2');

    const pathToDrilldown = findPathToNode(tree, 'layer_path2_fbd');
    expect(pathToDrilldown?.length).toBe(2);
    expect(pathToDrilldown?.[0].id).toBe('path_2');
    expect(pathToDrilldown?.[1].id).toBe('layer_path2_fbd');
  });

  it('6. 2. Yol çözüldüğünde belgenin en altına bağımsız bir bölüm olarak eklenir ve denklem numaralandırması devam eder', async () => {
    const mock = new MockProvider('tr');
    const doc = TrustedAssembler.assembleSolution(
      dummyProblem,
      MockProvider.getSpringWedgeOscillatorFixture()
    );

    const initialSectionsCount = doc.sections.length;
    const initialEqCount = doc.totalEquations;

    // 2. Yol çözümü çağrısı
    const altRaw = await mock.solve({
      id: 'test_alt_call',
      text: 'Çözüm yöntemi: Newton ve serbest cisim diyagramı ile 2. yol türetimi',
      createdAt: Date.now()
    });

    expect(altRaw.problemTitle).toContain('2. Yol');

    // 2. Yol bloklarını birleştirip yeni bölüm oluştur
    const newSectionId = 'sec_path_2';
    let blockCounter = 0;
    let eqNum = initialEqCount;

    const assembledBlocks: SolutionBlock[] = [];
    for (const sec of altRaw.sections || []) {
      for (const rb of sec.blocks || []) {
        const blks = TrustedAssembler.assembleBlocks(
          rb,
          newSectionId,
          () => {
            blockCounter++;
            return `${newSectionId}_b${blockCounter}`;
          },
          () => {
            eqNum++;
            return eqNum;
          }
        );
        assembledBlocks.push(...blks);
      }
    }

    const newSection: SolutionSection = {
      id: newSectionId,
      title: "2. Yol: Newton / d'Alembert Dinamiği",
      blocks: assembledBlocks
    };

    // Belgeye ekle
    const updatedDoc = {
      ...doc,
      sections: [...doc.sections, newSection],
      totalEquations: eqNum
    };

    expect(updatedDoc.sections.length).toBe(initialSectionsCount + 1);
    expect(updatedDoc.sections[updatedDoc.sections.length - 1].id).toBe('sec_path_2');
    expect(updatedDoc.totalEquations).toBeGreaterThan(initialEqCount);

    // Yeni bölüm içindeki denklemlerin numarası başlangıçtaki toplamdan büyük olmalıdır
    const altEquations = assembledBlocks.filter((b) => b.kind === 'equation');
    expect(altEquations.length).toBeGreaterThan(0);
    expect((altEquations[0] as any).displayNumber).toBe(initialEqCount + 1);
  });
});
