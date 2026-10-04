import type { AppConfig } from './config';
import { readCachedModels, type LiveProvider } from './modelCatalog';

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reportedCalls: number;
  unreportedCalls: number;
}

export interface ModelRunReport {
  role: 'router' | 'detection' | 'solution';
  providerName: string;
  modelName: string;
  reasoningEffort?: string;
  usage: TokenUsage;
  sharedAcrossQuestions?: number;
  cost?: { usd: number; source: 'provider' | 'catalog' | 'demo' };
}

export interface SolutionExecutionReport {
  durationMs: number;
  runs: ModelRunReport[];
  totalUsage: TokenUsage;
}

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: null, outputTokens: null, totalTokens: null, reportedCalls: 0, unreportedCalls: 0
};

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** Keep provider-reported counts only; visible text length is not a token count. */
export function readTokenUsage(response: unknown): TokenUsage {
  const data = response && typeof response === 'object' ? response as Record<string, unknown> : {};
  const source = data.usageMetadata || data.usage;
  const usage = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const input = count(usage.promptTokenCount ?? usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.promptTokens);
  const output = count(usage.candidatesTokenCount ?? usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens ?? usage.completionTokens);
  const total = count(usage.totalTokenCount ?? usage.total_tokens ?? usage.totalTokens);
  if (input === null && output === null && total === null) return { ...EMPTY_USAGE, unreportedCalls: 1 };
  return {
    inputTokens: input, outputTokens: output,
    totalTokens: total ?? (input !== null && output !== null ? input + output : null),
    reportedCalls: 1, unreportedCalls: 0
  };
}

export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const sum = (x: number | null, y: number | null) => x === null || y === null ? null : x + y;
  if (!a.reportedCalls && !a.unreportedCalls) return { ...b };
  if (!b.reportedCalls && !b.unreportedCalls) return { ...a };
  return {
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens: sum(a.outputTokens, b.outputTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens),
    reportedCalls: a.reportedCalls + b.reportedCalls,
    unreportedCalls: a.unreportedCalls + b.unreportedCalls
  };
}

export class UsageTracker {
  private usage: TokenUsage = { ...EMPTY_USAGE };
  private reportedCostUsd: number | null = 0;

  record(response: unknown): void {
    this.usage = addTokenUsage(this.usage, readTokenUsage(response));
    const data = response && typeof response === 'object' ? response as Record<string, unknown> : {};
    const details = data.usage && typeof data.usage === 'object' ? data.usage as Record<string, unknown> : {};
    const cost = details.cost;
    this.reportedCostUsd = this.reportedCostUsd !== null && typeof cost === 'number' && Number.isFinite(cost) && cost >= 0
      ? this.reportedCostUsd + cost : null;
  }

  snapshot(): TokenUsage {
    return { ...this.usage };
  }

  costSnapshot(): number | null {
    return this.reportedCostUsd;
  }
}

/** Attach an observed charge, or a clearly labeled catalog estimate, at solve time. */
export function withRunCost(run: ModelRunReport, config: AppConfig, reportedCostUsd?: number | null): ModelRunReport {
  if (run.providerName.includes('Demo')) return { ...run, cost: { usd: 0, source: 'demo' } };
  if (run.providerName === 'OpenRouter' && reportedCostUsd !== null && reportedCostUsd !== undefined
    && Number.isFinite(reportedCostUsd) && reportedCostUsd >= 0) {
    return { ...run, cost: { usd: reportedCostUsd, source: 'provider' } };
  }
  const provider: LiveProvider | undefined = run.providerName === 'OpenRouter' ? 'openrouter'
    : run.providerName === 'OpenAI' ? 'openai'
    : run.providerName === 'Google Gemini' || run.providerName === 'Gemini' ? 'gemini'
    : run.providerName === 'DeepSeek' ? 'deepseek' : undefined;
  if (!provider || run.usage.unreportedCalls || run.usage.inputTokens === null || run.usage.outputTokens === null) return run;
  const model = readCachedModels(config, provider).find(item => item.id === run.modelName);
  if (model?.priceInputPerMillion === undefined || model.priceOutputPerMillion === undefined) return run;
  return { ...run, cost: {
    usd: (run.usage.inputTokens * model.priceInputPerMillion + run.usage.outputTokens * model.priceOutputPerMillion) / 1_000_000,
    source: 'catalog'
  } };
}

export function totalRunUsage(runs: ModelRunReport[]): TokenUsage {
  return runs.reduce((total, run) => addTokenUsage(total, run.usage), { ...EMPTY_USAGE });
}
