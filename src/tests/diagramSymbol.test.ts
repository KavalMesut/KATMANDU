import { describe, it, expect } from 'vitest';
import { formatDiagramLabel } from '../components/SimpleDiagram';

describe('formatDiagramLabel', () => {
  it('converts Greek keywords and LaTeX commands into proper mathematical symbols', () => {
    expect(formatDiagramLabel('\\theta')).toBe('θ');
    expect(formatDiagramLabel('theta')).toBe('θ');
    expect(formatDiagramLabel('\\alpha')).toBe('α');
    expect(formatDiagramLabel('beta')).toBe('β');
    expect(formatDiagramLabel('\\phi')).toBe('φ');
    expect(formatDiagramLabel('omega')).toBe('ω');
  });

  it('converts composite expressions like mg sin theta and subscripts', () => {
    expect(formatDiagramLabel('mg\\sin\\theta')).toBe('mg sin θ');
    expect(formatDiagramLabel('m_1')).toBe('m₁');
    expect(formatDiagramLabel('m_{2}')).toBe('m₂');
    expect(formatDiagramLabel('x_0')).toBe('x₀');
    expect(formatDiagramLabel('F_{net}')).toBe('Fₙₑₜ');
  });

  it('handles vector notations', () => {
    expect(formatDiagramLabel('\\vec{F}')).toBe('F⃗');
    expect(formatDiagramLabel('\\vec{r}')).toBe('r⃗');
  });

  it('handles edge cases and nullish values safely', () => {
    expect(formatDiagramLabel('')).toBe('');
    expect(formatDiagramLabel(null)).toBe('');
    expect(formatDiagramLabel(undefined)).toBe('');
  });
});
