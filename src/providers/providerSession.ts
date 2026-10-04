import { createTranslator, getLanguage, type Language } from '../i18n';
import { AppConfig } from '../domain/config';
import { SolutionMetadata } from '../domain/types';
import type { UsageTracker } from '../domain/usageReport';
import { SolutionProvider } from './solutionProvider';
import { ExpansionProvider } from './expansionProvider';
import { MockProvider } from './mockProvider';
import { OpenAIProvider } from './openaiProvider';
import { GeminiProvider } from './geminiProvider';
import { OpenRouterProvider } from './openRouterProvider';
import { DeepSeekProvider } from './deepseekProvider';

export type Provider = SolutionProvider & ExpansionProvider & { usageTracker?: UsageTracker };
export interface ProviderSession {
  provider: Provider | null;
  isDemo: boolean;
  error: string | null;
  createMetadata(): SolutionMetadata;
  fork(language?: Language): ProviderSession;
}

/** Capture both the provider and its provenance from the same configuration snapshot. */
export function createProviderSession(config: AppConfig): ProviderSession {
  const snapshot = { ...config, language: config.language ?? getLanguage() };
  const translate = createTranslator(snapshot.language);
  let provider: Provider | null = null;
  let source: Omit<SolutionMetadata, 'solvedAt'>;
  let error: string | null = null;
  const isDemo = snapshot.activeProvider === 'mock';
  const missingKey = (name: string) => translate("{0} API anahtarı eksik. Ayarlar’dan anahtarınızı girin veya Çevrimdışı Demo modunu açıkça seçin.", [name]);

  switch (snapshot.activeProvider) {
    case 'mock':
      provider = new MockProvider(snapshot.language);
      source = { providerName: translate("KATMANDU Çevrimdışı Demo"), modelName: translate("Hazır kanonik örnekler") };
      break;
    case 'openai':
      source = { providerName: 'OpenAI', modelName: snapshot.openaiModel, reasoningEffort: snapshot.openaiReasoningEffort };
      if (snapshot.openaiApiKey?.trim()) provider = new OpenAIProvider(snapshot);
      else error = missingKey(source.providerName);
      break;
    case 'gemini':
      source = { providerName: 'Google Gemini', modelName: snapshot.geminiModel, reasoningEffort: snapshot.geminiThinkingLevel };
      if (snapshot.geminiApiKey?.trim()) provider = new GeminiProvider(snapshot);
      else error = missingKey(source.providerName);
      break;
    case 'openrouter':
      source = { providerName: 'OpenRouter', modelName: snapshot.openrouterModel, reasoningEffort: snapshot.openrouterReasoningEffort };
      if (snapshot.openrouterApiKey?.trim()) provider = new OpenRouterProvider(snapshot);
      else error = missingKey(source.providerName);
      break;
    case 'deepseek':
      source = { providerName: 'DeepSeek', modelName: snapshot.deepseekModel, reasoningEffort: snapshot.deepseekModel === 'deepseek-reasoner' ? 'high' : undefined };
      if (snapshot.deepseekApiKey?.trim()) provider = new DeepSeekProvider(snapshot);
      else error = missingKey(source.providerName);
      break;
    default:
      source = { providerName: translate("Desteklenmeyen sağlayıcı"), modelName: '' };
      error = translate("Seçili sağlayıcı bu sürümde desteklenmiyor. Ayarlar’dan bir sağlayıcı seçin.");
  }

  return {
    provider, isDemo, error,
    fork(language = snapshot.language) { return createProviderSession({ ...snapshot, language }); },
    createMetadata() {
      if (!provider) throw new Error(error || translate("Sağlayıcı hazır değil."));
      return {
        ...source,
        reasoningEffort: provider instanceof OpenRouterProvider
          ? provider.appliedReasoningEffort
          : source.reasoningEffort,
        language: snapshot.language,
        solvedAt: Date.now()
      };
    }
  };
}

/** Reopen a saved solution with its recorded model, without rewriting historical metadata. */
export function createSessionForSavedSolution(config: AppConfig, metadata?: SolutionMetadata): ProviderSession | null {
  if (!metadata?.modelName) return null;
  const source = metadata.providerName.toLowerCase();
  const snapshot = { ...config, language: metadata.language ?? config.language ?? getLanguage() };
  if (source.includes('openrouter')) {
    snapshot.activeProvider = 'openrouter'; snapshot.openrouterModel = metadata.modelName;
  } else if (source.includes('gemini') || source === 'google') {
    snapshot.activeProvider = 'gemini'; snapshot.geminiModel = metadata.modelName;
  } else if (source.includes('deepseek')) {
    snapshot.activeProvider = 'deepseek'; snapshot.deepseekModel = metadata.modelName;
  } else if (source.includes('openai')) {
    snapshot.activeProvider = 'openai'; snapshot.openaiModel = metadata.modelName;
  } else if (source.includes('demo')) {
    if (config.activeProvider !== 'mock') return null;
    snapshot.activeProvider = 'mock';
  } else {
    return null;
  }
  return createProviderSession(snapshot);
}
