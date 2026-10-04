import { ProblemInput, RawSolutionResponse, DetectedQuestionItem } from '../domain/types';

/**
 * SolutionProvider Arayüzü (HD-010 prensibiyle uyumlu):
 * Çekirdek motor belirli bir LLM sağlayıcısına (OpenAI, Gemini, Ollama vb.) doğrudan bağımlı değildir.
 * Herhangi bir sağlayıcı bu arayüzü uygulayabilir.
 */
export interface SolutionProvider {
  readonly providerName: string;
  setRequestSignal?(signal: AbortSignal): void;
  setBudgetSpent?(usd: number): void;
  solve(problem: ProblemInput): Promise<RawSolutionResponse>;
  detectQuestions?(problem: ProblemInput): Promise<DetectedQuestionItem[]>;
}
