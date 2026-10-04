import { translate } from '../i18n';
import type { AppConfig } from './config';
import { assertSafeProviderUrl, fetchProvider } from './providerSecurity';

export type LiveProvider = Exclude<AppConfig['activeProvider'], 'mock'>;

export interface ModelDescriptor {
  id: string;
  name: string;
  provider: LiveProvider;
  inputModalities?: string[];
  outputModalities?: string[];
  supportedParameters?: string[];
  reasoningLevels?: string[];
  contextWindow?: number;
  priceInputPerMillion?: number;
  priceOutputPerMillion?: number;
  supportedMethods?: string[];
}

export function modelCompanyId(modelId: string): string {
  const separator = modelId.indexOf('/');
  return separator > 0 ? modelId.slice(0, separator).replace(/^~/, '').toLowerCase() : 'other';
}

export function modelCompanyName(companyId: string): string {
  const names: Record<string, string> = {
    ai21: 'AI21', anthropic: 'Anthropic', deepseek: 'DeepSeek', google: 'Google',
    meta: 'Meta', mistralai: 'Mistral AI', openai: 'OpenAI', qwen: 'Qwen',
    xai: 'xAI', other: translate("Diğer")
  };
  return names[companyId] || companyId.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

const CACHE_PREFIX = 'katmandu_model_catalog_v1_';
const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const pendingCatalogs = new Map<string, Promise<ModelDescriptor[]>>();

function cacheScope(config: AppConfig, provider: LiveProvider): string {
  const key = provider === 'openai' ? config.openaiApiKey.trim()
    : provider === 'gemini' ? config.geminiApiKey.trim()
    : provider === 'deepseek' ? config.deepseekApiKey.trim()
    : config.openrouterApiKey.trim();
  const base = provider === 'openai' ? config.openaiBaseUrl
    : provider === 'deepseek' ? config.deepseekBaseUrl
    : provider === 'openrouter' ? config.openrouterBaseUrl : 'https://generativelanguage.googleapis.com/v1beta';
  // Keep credentials out of the catalog cache while separating accounts.
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${base.replace(/\/+$/, '')}|${(hash >>> 0).toString(16)}`;
}

export function readCachedModels(config: AppConfig, provider: LiveProvider): ModelDescriptor[] {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${provider}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { scope?: string; models?: ModelDescriptor[] };
    if (parsed.scope !== cacheScope(config, provider)) return [];
    return Array.isArray(parsed.models) ? parsed.models.filter(model => typeof model.id === 'string') : [];
  } catch {
    return [];
  }
}

function cacheIsFresh(config: AppConfig, provider: LiveProvider): boolean {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${provider}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { fetchedAt?: number; scope?: string };
    return parsed.scope === cacheScope(config, provider) && typeof parsed.fetchedAt === 'number' && Date.now() - parsed.fetchedAt < CACHE_LIFETIME_MS;
  } catch {
    return false;
  }
}

function saveCache(config: AppConfig, provider: LiveProvider, models: ModelDescriptor[]): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${provider}`, JSON.stringify({ scope: cacheScope(config, provider), fetchedAt: Date.now(), models }));
  } catch { /* Catalog remains available for the current session. */ }
}

async function fetchJson(url: string, key?: string, google = false): Promise<unknown> {
  const response = await fetchProvider(url, {
    headers: key ? (google ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` }) : undefined
  });
  if (!response.ok) {
    throw new Error(translate("Model listesi alınamadı (HTTP {0}). API anahtarınızı kontrol edin.", [response.status]));
  }
  return response.json();
}

function cleanBaseUrl(url: string): string {
  assertSafeProviderUrl(url);
  const parsed = new URL(url);
  return parsed.toString().replace(/\/+$/, '');
}

function perMillionPrice(value: unknown): number | undefined {
  if ((typeof value !== 'string' || !value.trim()) && typeof value !== 'number') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : undefined;
}

function normalize(data: unknown, provider: LiveProvider): ModelDescriptor[] {
  if (!data || typeof data !== 'object') return [];
  const records = data as Record<string, unknown>;
  const rawModels = provider === 'gemini' ? records.models : records.data;
  if (!Array.isArray(rawModels)) return [];

  const models: ModelDescriptor[] = [];
  for (const raw of rawModels) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const rawId = String(item.id || item.name || '');
    const id = provider === 'gemini' ? rawId.replace(/^models\//, '') : rawId;
    if (!id) continue;
    const methods = Array.isArray(item.supportedGenerationMethods)
      ? item.supportedGenerationMethods.map(String)
      : undefined;
    if (provider === 'gemini' && methods && !methods.includes('generateContent')) continue;
    const pricing = item.pricing && typeof item.pricing === 'object'
      ? item.pricing as Record<string, unknown>
      : {};
    const effort = item.effort && typeof item.effort === 'object'
      ? item.effort as Record<string, unknown>
      : {};
    const architecture = item.architecture && typeof item.architecture === 'object'
      ? item.architecture as Record<string, unknown>
      : {};
    const inputModalities = Array.isArray(item.input_modalities) ? item.input_modalities : architecture.input_modalities;
    const outputModalities = Array.isArray(item.output_modalities) ? item.output_modalities : architecture.output_modalities;
    models.push({
      id,
      name: String(item.displayName || (provider === 'gemini' ? id : item.name) || id),
      provider,
      inputModalities: Array.isArray(inputModalities) ? inputModalities.map(String) : undefined,
      outputModalities: Array.isArray(outputModalities) ? outputModalities.map(String) : undefined,
      supportedParameters: Array.isArray(item.supported_parameters) ? item.supported_parameters.map(String) : undefined,
      reasoningLevels: Array.isArray(effort.supported_levels) ? effort.supported_levels.map(String) : undefined,
      contextWindow: typeof item.context_length === 'number' ? item.context_length
        : typeof item.context_window === 'number' ? item.context_window
        : typeof item.inputTokenLimit === 'number' ? item.inputTokenLimit : undefined,
      priceInputPerMillion: perMillionPrice(pricing.prompt),
      priceOutputPerMillion: perMillionPrice(pricing.completion),
      supportedMethods: methods
    });
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchModelCatalog(
  config: AppConfig,
  provider: LiveProvider,
  forceRefresh = false
): Promise<ModelDescriptor[]> {
  const requestKey = `${provider}|${cacheScope(config, provider)}`;
  const pending = pendingCatalogs.get(requestKey);
  if (pending) return pending;
  const cached = readCachedModels(config, provider);
  if (!forceRefresh && cached.length && cacheIsFresh(config, provider)) return cached;

  const key = provider === 'openai' ? config.openaiApiKey.trim()
    : provider === 'gemini' ? config.geminiApiKey.trim()
    : provider === 'deepseek' ? config.deepseekApiKey.trim()
    : config.openrouterApiKey.trim();
  if (!key && provider !== 'openrouter') {
    if (cached.length) return cached;
    throw new Error(translate("Model listesini almak için önce API anahtarı girin."));
  }

  const request = (async () => {
    try {
      let data: unknown;
      if (provider === 'gemini') {
        const all: unknown[] = [];
        let token: string | undefined;
        do {
          const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
          url.searchParams.set('pageSize', '1000');
          if (token) url.searchParams.set('pageToken', token);
          const page = await fetchJson(url.toString(), key, true) as { models?: unknown[]; nextPageToken?: string };
          all.push(...(page.models || []));
          token = page.nextPageToken;
        } while (token && all.length < 5000);
        data = { models: all };
      } else {
        const base = provider === 'openai' ? config.openaiBaseUrl
          : provider === 'deepseek' ? config.deepseekBaseUrl : config.openrouterBaseUrl;
        data = await fetchJson(`${cleanBaseUrl(base)}/models`, key || undefined);
      }
      const models = normalize(data, provider);
      if (!models.length) throw new Error(translate("Sağlayıcı kullanılabilir bir model döndürmedi."));
      saveCache(config, provider, models);
      return models;
    } catch (error) {
      if (cached.length) return cached;
      throw error;
    }
  })();
  pendingCatalogs.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (pendingCatalogs.get(requestKey) === request) pendingCatalogs.delete(requestKey);
  }
}

export async function refreshConfiguredModelCatalogs(config: AppConfig): Promise<void> {
  const configured: LiveProvider[] = [];
  if (config.openaiApiKey.trim()) configured.push('openai');
  if (config.geminiApiKey.trim()) configured.push('gemini');
  if (config.deepseekApiKey.trim()) configured.push('deepseek');
  if (config.openrouterApiKey.trim()) configured.push('openrouter');
  await Promise.allSettled(configured.map(provider => fetchModelCatalog(config, provider, true)));
}
