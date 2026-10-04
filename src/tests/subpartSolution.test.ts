import { describe, expect, it } from 'vitest';
import { buildSubpartSolutionInstruction, detectMultipleQuestions } from '../domain/questionParser';

describe('alt maddeli soru çözümü', () => {
  it('a/b/c alt maddelerini tek soru tutup özgün sırasını çözüm istemine taşır', () => {
    const question = 'Bir cismin hareketini inceleyin:\na) Hızını bulun.\nb) İvmesini bulun.\nc) Sonucu yorumlayın.';
    expect(detectMultipleQuestions(question)).toHaveLength(1);
    const instruction = buildSubpartSolutionInstruction(question);
    expect(instruction).toContain('a), b), c)');
    expect(instruction).toContain('"sections"');
    expect(instruction).toContain('ayrı bir bölüm');
    expect(instruction).toContain('\\boxed{...}');
  });

  it('görsel soruda metin etiketi bilinmese de alt maddeleri korumayı ister', () => {
    const instruction = buildSubpartSolutionInstruction('');
    expect(instruction).toContain('Görsel/PDF');
    expect(instruction).toContain('Harfleri değiştirme');
    expect(instruction).not.toContain('Metinde görülen alt madde etiketleri');
  });
});
