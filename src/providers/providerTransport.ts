import { createTranslator, getLanguage } from '../i18n';
import type { AppConfig } from '../domain/config';
import { readCachedModels, type LiveProvider } from '../domain/modelCatalog';
import { throwIfAborted, abortableDelay, isRequestStopped, requestTimeout } from '../domain/requestControl';
import { withRunCost, type UsageTracker } from '../domain/usageReport';
import { fetchProvider } from '../domain/providerSecurity';

export { isRequestStopped, throwIfAborted };
/** Shared cancellation, bounded waits and cost admission for every live provider. */
export class ProviderTransport {
  signal?: AbortSignal;
  initialCostUsd = 0;
  private translate: ReturnType<typeof createTranslator>;
  constructor(private config: AppConfig, private provider: LiveProvider, private tracker: UsageTracker) {
    this.translate = createTranslator(config.language ?? getLanguage());
  }
  delay(ms: number) { return abortableDelay(ms, this.signal); }
  async fetch(url: string, init: RequestInit): Promise<Response> {
    throwIfAborted(this.signal);
    this.checkBudget(init.body);
    // Keep the operation signal attached after headers arrive, so body reads abort too.
    const signal = this.signal || AbortSignal.timeout(requestTimeout(this.config));
    try {
      return await fetchProvider(url, { ...init, signal }, this.translate);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw error;
    }
  }
  private checkBudget(body: BodyInit | null | undefined): void {
    const limit = this.config.maxCostPerQuestionUsd;
    if (!limit || limit <= 0) return;
    const fail = (message: string): never => { const error = new Error(message); error.name = 'BudgetError'; throw error; };
    const modelId = this.config[`${this.provider}Model`];
    const model = readCachedModels(this.config, this.provider).find(item => item.id === modelId);
    if (model?.priceInputPerMillion === undefined || model.priceOutputPerMillion === undefined) {
      fail(this.translate("Harcama sınırı için model fiyatı bilinmiyor. Kataloğu yenileyin, fiyatı bilinen bir model seçin veya Ayarlar’dan sınırı kapatın."));
    }
    const payload = typeof body === 'string' ? JSON.parse(body) : {};
    // Reserve the configured output allowance. Binary attachments have a separate estimate.
    let chars = 0, attachments = 0;
    const visit = (value: unknown, key = '') => {
      if (typeof value === 'string') {
        if (['text', 'content'].includes(key)) chars += value.length;
        else if (['image_url', 'file_data', 'data'].includes(key) || (key === 'url' && value.startsWith('data:'))) attachments++;
      } else if (Array.isArray(value)) value.forEach(item => visit(item, key));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([name, item]) => visit(item, name));
    };
    visit(payload);
    const input = Math.ceil(chars / 3) + attachments * 3600;
    const output = payload.max_tokens || payload.max_completion_tokens || payload.max_output_tokens || payload.generationConfig?.maxOutputTokens || 12000;
    const estimate = (input * model!.priceInputPerMillion! + output * model!.priceOutputPerMillion!) / 1e6;
    const names = { openai: 'OpenAI', gemini: 'Google Gemini', deepseek: 'DeepSeek', openrouter: 'OpenRouter' };
    const used = withRunCost({ role: 'solution', providerName: names[this.provider], modelName: modelId,
      usage: this.tracker.snapshot() }, this.config, this.tracker.costSnapshot()).cost?.usd || 0;
    if (this.initialCostUsd + used + estimate > limit) fail(this.translate("Bu isteğin tahmini maliyeti soru başına ${0} sınırını aşıyor. Daha ekonomik bir model seçin veya Ayarlar’dan sınırı artırın.", [limit.toFixed(2)]));
  }
}
