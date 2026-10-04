import { describe, it, expect } from 'vitest';
import { SimpleDiagramSpec } from '../domain/types';
import { diagramToTikZ } from '../domain/latexExporter';

describe('Matematiksel Şema & Fonksiyon Eğrisi Testleri (curve & fillUnder)', () => {
  it('diagramToTikZ: curve öğesini plot[smooth] coordinates ile TikZ koduna dönüştürmelidir', () => {
    const mathSpec: SimpleDiagramSpec = {
      width: 400,
      height: 250,
      elements: [
        {
          type: 'axis',
          origin: [50, 200],
          xLength: 300,
          yLength: 160,
          xLabel: 'x',
          yLabel: 'y = f(x)'
        },
        {
          type: 'curve',
          points: [
            [50, 200],
            [100, 160],
            [150, 110],
            [200, 70],
            [250, 60],
            [300, 90]
          ],
          label: 'y = x^2 - 4x + 5',
          color: '#2563eb',
          style: 'solid'
        }
      ]
    };

    const tikz = diagramToTikZ(mathSpec);
    expect(tikz).toContain('\\begin{tikzpicture}');
    expect(tikz).toContain('plot[smooth] coordinates {(50, 200) (100, 160) (150, 110) (200, 70) (250, 60) (300, 90)}');
    expect(tikz).toContain('y = x^2 - 4x + 5');
    expect(tikz).toContain('\\end{tikzpicture}');
  });

  it('diagramToTikZ: fillUnder (integral alt alanı) olduğunda \\fill döngüsü üretmelidir', () => {
    const integralSpec: SimpleDiagramSpec = {
      width: 400,
      height: 250,
      elements: [
        {
          type: 'curve',
          points: [
            [80, 180],
            [140, 120],
            [200, 80],
            [260, 130]
          ],
          fillUnder: true,
          fillBaselineY: 200,
          label: '\\int_a^b f(x) dx'
        }
      ]
    };

    const tikz = diagramToTikZ(integralSpec);
    expect(tikz).toContain('\\fill[blue!15]');
    expect(tikz).toContain('(80, 200) -- plot[smooth] coordinates {(80, 180) (140, 120) (200, 80) (260, 130)} -- (260, 200) -- cycle;');
    expect(tikz).toContain('plot[smooth] coordinates');
  });

  it('diagramToTikZ: dashed stilini doğru TikZ parametresiyle yansıtmalıdır', () => {
    const dashedSpec: SimpleDiagramSpec = {
      width: 300,
      height: 200,
      elements: [
        {
          type: 'curve',
          points: [
            [20, 150],
            [80, 50],
            [160, 150]
          ],
          style: 'dashed'
        }
      ]
    };

    const tikz = diagramToTikZ(dashedSpec);
    expect(tikz).toContain('dashed, thick');
  });

  it('diagramToTikZ: Fiziksel öğeler (mass, spring, pulley) ile matematiksel curve birlikte hatasız çalışmalıdır (Sıfır Regresyon)', () => {
    const combinedSpec: SimpleDiagramSpec = {
      width: 400,
      height: 300,
      elements: [
        { type: 'mass', id: 'm1', x: 100, y: 100, label: 'm' },
        { type: 'line', from: [50, 50], to: [100, 100], style: 'spring', label: 'k' },
        {
          type: 'curve',
          points: [
            [100, 250],
            [150, 210],
            [200, 240]
          ],
          label: 'V(x) = \\frac{1}{2}kx^2'
        }
      ]
    };

    const tikz = diagramToTikZ(combinedSpec);
    expect(tikz).toContain('gray!15'); // mass
    expect(tikz).toContain('decorate, decoration={coil'); // spring
    expect(tikz).toContain('plot[smooth] coordinates'); // curve
  });
});
