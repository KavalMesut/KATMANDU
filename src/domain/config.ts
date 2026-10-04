/**
 * KATMANDU v2 Yapılandırma ve Ayarlar Katmanı
 */

export interface AppConfig {
  language?: 'en' | 'tr';
  activeProvider: 'mock' | 'openai' | 'gemini' | 'deepseek' | 'openrouter';
  modelSelectionMode?: 'auto' | 'manual';
  recommendationProvider?: 'local' | 'openai' | 'openrouter';
  recommendationModel?: string;
  requestTimeoutSeconds?: number;
  maxConcurrentRequests?: number;
  maxCostPerQuestionUsd?: number;
  // OpenAI Ayarları
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiProtocol?: 'chat-completions' | 'responses';
  openaiReasoningEffort: 'low' | 'medium' | 'high';
  // Google Gemini Ayarları
  geminiApiKey: string;
  geminiModel: string;
  geminiThinkingLevel: 'low' | 'medium' | 'high';
  geminiThinkingBudget?: number;
  // DeepSeek Ayarları
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  // OpenRouter Ayarları
  openrouterApiKey: string;
  openrouterBaseUrl: string;
  openrouterModel: string;
  openrouterReasoningEffort: 'low' | 'medium' | 'high';
}

const STORAGE_KEY = 'katmandu_app_config_v2';

export const DEFAULT_CONFIG: AppConfig = {
  activeProvider: 'gemini', // Ücretsiz Gemini varsayılan olarak seçili
  modelSelectionMode: 'manual',
  recommendationProvider: 'openai',
  recommendationModel: 'gpt-6-sol',
  requestTimeoutSeconds: 300,
  maxConcurrentRequests: 2,
  maxCostPerQuestionUsd: 0,
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-5.6-terra',
  openaiProtocol: 'chat-completions',
  openaiReasoningEffort: 'medium',
  geminiApiKey: '',
  geminiModel: 'gemini-3.6-flash', // Google API'nin yeni kullanıcılar için zorunlu kıldığı kararlı model
  geminiThinkingLevel: 'medium',
  geminiThinkingBudget: 2048,
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekModel: 'deepseek-reasoner', // DeepSeek-R1 varsayılan
  openrouterApiKey: '',
  openrouterBaseUrl: 'https://openrouter.ai/api/v1',
  openrouterModel: 'anthropic/claude-sonnet-4.6',
  openrouterReasoningEffort: 'low' // Varsayılan ekonomik akıl yürütme seviyesi (~0.03$)
};

export class ConfigManager {
  public static getConfig(): AppConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const model = parsed.geminiModel || (import.meta.env.VITE_GEMINI_MODEL as string) || DEFAULT_CONFIG.geminiModel;
        const orModel = parsed.openrouterModel || (import.meta.env.VITE_OPENROUTER_MODEL as string) || DEFAULT_CONFIG.openrouterModel;

        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          requestTimeoutSeconds: typeof parsed.requestTimeoutSeconds === 'number' && Number.isFinite(parsed.requestTimeoutSeconds) ? Math.max(30, Math.min(900, parsed.requestTimeoutSeconds)) : 300,
          maxConcurrentRequests: typeof parsed.maxConcurrentRequests === 'number' && Number.isFinite(parsed.maxConcurrentRequests) ? Math.max(1, Math.min(4, Math.round(parsed.maxConcurrentRequests))) : 2,
          maxCostPerQuestionUsd: typeof parsed.maxCostPerQuestionUsd === 'number' && Number.isFinite(parsed.maxCostPerQuestionUsd) ? Math.max(0, parsed.maxCostPerQuestionUsd) : 0,
          // Automatic model selection is temporarily disabled, including old stored preferences.
          modelSelectionMode: 'manual',
          recommendationProvider: ['local', 'openai', 'openrouter'].includes(parsed.recommendationProvider) ? parsed.recommendationProvider : DEFAULT_CONFIG.recommendationProvider,
          recommendationModel: typeof parsed.recommendationModel === 'string' && parsed.recommendationModel.trim() ? parsed.recommendationModel : DEFAULT_CONFIG.recommendationModel,
          openaiApiKey: parsed.openaiApiKey || (import.meta.env.VITE_OPENAI_API_KEY as string) || '',
          openaiBaseUrl: parsed.openaiBaseUrl || (import.meta.env.VITE_OPENAI_BASE_URL as string) || DEFAULT_CONFIG.openaiBaseUrl,
          openaiModel: parsed.openaiModel || (import.meta.env.VITE_OPENAI_MODEL as string) || DEFAULT_CONFIG.openaiModel,
          openaiProtocol: parsed.openaiProtocol === 'responses' ? 'responses' : 'chat-completions',
          openaiReasoningEffort: parsed.openaiReasoningEffort || (import.meta.env.VITE_OPENAI_REASONING_EFFORT as 'low' | 'medium' | 'high') || DEFAULT_CONFIG.openaiReasoningEffort,
          geminiApiKey: parsed.geminiApiKey || (import.meta.env.VITE_GEMINI_API_KEY as string) || '',
          geminiModel: model,
          geminiThinkingLevel: parsed.geminiThinkingLevel || DEFAULT_CONFIG.geminiThinkingLevel,
          geminiThinkingBudget: parsed.geminiThinkingBudget !== undefined ? Number(parsed.geminiThinkingBudget) : DEFAULT_CONFIG.geminiThinkingBudget,
          deepseekApiKey: parsed.deepseekApiKey || (import.meta.env.VITE_DEEPSEEK_API_KEY as string) || '',
          deepseekBaseUrl: parsed.deepseekBaseUrl || (import.meta.env.VITE_DEEPSEEK_BASE_URL as string) || DEFAULT_CONFIG.deepseekBaseUrl,
          deepseekModel: parsed.deepseekModel || (import.meta.env.VITE_DEEPSEEK_MODEL as string) || DEFAULT_CONFIG.deepseekModel,
          openrouterApiKey: parsed.openrouterApiKey || (import.meta.env.VITE_OPENROUTER_API_KEY as string) || '',
          openrouterBaseUrl: parsed.openrouterBaseUrl || (import.meta.env.VITE_OPENROUTER_BASE_URL as string) || DEFAULT_CONFIG.openrouterBaseUrl,
          openrouterModel: orModel,
          openrouterReasoningEffort: parsed.openrouterReasoningEffort || (import.meta.env.VITE_OPENROUTER_REASONING_EFFORT as 'low' | 'medium' | 'high') || DEFAULT_CONFIG.openrouterReasoningEffort
        };
      }
    } catch (e) {
      console.warn('Yapılandırma yüklenemedi, varsayılanlar kullanılacak:', e);
    }

    return {
      ...DEFAULT_CONFIG,
      openaiApiKey: (import.meta.env.VITE_OPENAI_API_KEY as string) || '',
      openaiBaseUrl: (import.meta.env.VITE_OPENAI_BASE_URL as string) || DEFAULT_CONFIG.openaiBaseUrl,
      openaiModel: (import.meta.env.VITE_OPENAI_MODEL as string) || DEFAULT_CONFIG.openaiModel,
      openaiProtocol: DEFAULT_CONFIG.openaiProtocol,
      openaiReasoningEffort: (import.meta.env.VITE_OPENAI_REASONING_EFFORT as 'low' | 'medium' | 'high') || DEFAULT_CONFIG.openaiReasoningEffort,
      geminiApiKey: (import.meta.env.VITE_GEMINI_API_KEY as string) || '',
      geminiModel: (import.meta.env.VITE_GEMINI_MODEL as string) || DEFAULT_CONFIG.geminiModel,
      geminiThinkingLevel: DEFAULT_CONFIG.geminiThinkingLevel,
      geminiThinkingBudget: DEFAULT_CONFIG.geminiThinkingBudget,
      deepseekApiKey: (import.meta.env.VITE_DEEPSEEK_API_KEY as string) || '',
      deepseekBaseUrl: (import.meta.env.VITE_DEEPSEEK_BASE_URL as string) || DEFAULT_CONFIG.deepseekBaseUrl,
      deepseekModel: (import.meta.env.VITE_DEEPSEEK_MODEL as string) || DEFAULT_CONFIG.deepseekModel,
      openrouterApiKey: (import.meta.env.VITE_OPENROUTER_API_KEY as string) || '',
      openrouterBaseUrl: (import.meta.env.VITE_OPENROUTER_BASE_URL as string) || DEFAULT_CONFIG.openrouterBaseUrl,
      openrouterModel: (import.meta.env.VITE_OPENROUTER_MODEL as string) || DEFAULT_CONFIG.openrouterModel,
      openrouterReasoningEffort: (import.meta.env.VITE_OPENROUTER_REASONING_EFFORT as 'low' | 'medium' | 'high') || DEFAULT_CONFIG.openrouterReasoningEffort
    };
  }

  public static saveConfig(config: AppConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, modelSelectionMode: 'manual' }));
    } catch (e) {
      console.error('Yapılandırma kaydedilemedi:', e);
    }
  }
}
