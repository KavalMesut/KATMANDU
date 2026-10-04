import { setLanguage, type Language } from '../i18n';
import { useLanguage } from '../i18n/react';
import { translate } from '../i18n';
import { requestTimeout } from '../domain/requestControl';
import { fetchProvider } from '../domain/providerSecurity';
import React, { useState } from 'react';
import { ModelPicker } from './ModelPicker';
import { AppConfig, DEFAULT_CONFIG } from '../domain/config';
import { GeminiProvider } from '../providers/geminiProvider';
import { buildOpenAIRequest, extractOpenAIText, requiresResponsesApi, type OpenAIProtocol } from '../providers/openaiProtocol';
import {
  X,
  Key,
  Cpu,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown
} from 'lucide-react';

export interface ModelCostTier {
  low: string;
  medium: string;
  high: string;
  note: string;
  badge?: string;
}

export function getModelCostEstimate(modelId: string): ModelCostTier {
  const m = (modelId || '').toLowerCase().trim();

  // 1. Ücretsiz modeller (:free)
  if (m.endsWith(':free') || m.includes(':free') || m.includes('free')) {
    return {
      low: translate("0.00$ (Ücretsiz)"),
      medium: translate("0.00$ (Ücretsiz)"),
      high: translate("0.00$ (Ücretsiz)"),
      badge: translate("🎁 %100 Ücretsiz"),
      note: translate("🎁 Bu model tamamen ücretsizdir (:free). Akıl yürütme seviyesi ne olursa olsun bakiye harcamaz.")
    };
  }

  // 2. Ultra-ekonomik modeller (DeepSeek R1/V3, Gemini Flash, GPT-4o-mini, Haiku, Qwen, Nemotron, LFM)
  if (
    m.includes('deepseek') ||
    m.includes('flash') ||
    m.includes('mini') ||
    m.includes('haiku') ||
    m.includes('qwen') ||
    m.includes('liquid') ||
    m.includes('nemotron')
  ) {
    return {
      low: '< 0.002$',
      medium: '~0.004$',
      high: '~0.008$',
      badge: translate("⚡ Ultra Ekonomik"),
      note: translate("⚡ Son derece ekonomik model. Düşük seviyede soru ve derinleşme başı maliyet 1 sentin çok altındadır (< 0.002$).")
    };
  }

  // 3. Ultra-büyük modeller (Claude Opus vb.)
  if (m.includes('opus')) {
    return {
      low: '~0.10$',
      medium: '~0.25$',
      high: '~0.50$+',
      badge: translate("💎 Ağır Sıklet"),
      note: translate("⚠️ Opus sınıfı modellerde token başına ücret yüksektir. Bütçeyi korumak için \"Düşük (Low)\" önerilir.")
    };
  }

  // 4. Amiral gemisi akıl yürütme modelleri (Claude Sonnet, GPT-4o, GPT-5.6 Terra, o1, o3)
  if (
    m.includes('sonnet') ||
    m.includes('gpt-4o') ||
    m.includes('terra') ||
    m.includes('o1') ||
    m.includes('o3')
  ) {
    return {
      low: '~0.03$',
      medium: '~0.06$',
      high: '~0.12$ - 0.15$',
      badge: translate("🧠 Zirve Akıl Yürütme"),
      note: translate("💡 Claude Sonnet gibi amiral gemisi modellerde düşünce tokenleri çıktıyı uzatır. \"Düşük (Low)\" seçildiğinde soru başı harcama ~0.03$'a düşerek bütçenizi korur.")
    };
  }

  // 5. Genel / Bilinmeyen modeller için token bütçesi bazlı tahmin
  return {
    low: translate("Kısıtlı Düşünce (~1-2k Token)"),
    medium: translate("Dengeli Düşünce (~4-8k Token)"),
    high: translate("Maksimum Düşünce (~16k+ Token)"),
    note: translate("💡 Akıl yürütme seviyesi modelin düşünce (thinking) token bütçesini kontrol eder. Düşük seviye çıktı tokenlerini sınırlayarak maliyeti düşürür.")
  };
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSaveConfig: (newConfig: AppConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig
}) => {
  const language = useLanguage();
  const [formConfig, setFormConfig] = useState<AppConfig>(config);
  const [showKey, setShowKey] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({ ...formConfig, modelSelectionMode: 'manual' });
    onClose();
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage(translate("Model bağlantısı sınanıyor..."));

    if (formConfig.activeProvider === 'gemini') {
      if (!formConfig.geminiApiKey.trim()) {
        setTestStatus('error');
        setTestMessage(translate("Lütfen önce bir Google Gemini API anahtarı girin."));
        return;
      }
      const provider = new GeminiProvider(formConfig);
      const res = await provider.testConnection().catch(error => ({ success: false,
        message: error instanceof Error ? error.message : translate("Bağlantı sınanamadı.") }));
      if (res.success) {
        setTestStatus('success');
        setTestMessage(res.message);
      } else {
        setTestStatus('error');
        setTestMessage(res.message);
      }
      return;
    }

    if (formConfig.activeProvider === 'openai') {
      if (!formConfig.openaiApiKey.trim()) {
        setTestStatus('error');
        setTestMessage(translate("Lütfen önce bir OpenAI API anahtarı girin."));
        return;
      }

      try {
        let protocol: OpenAIProtocol = formConfig.openaiProtocol || 'chat-completions';
        for (let attempt = 0; attempt < 2; attempt++) {
          const url = `${formConfig.openaiBaseUrl.replace(/\/+$/, '')}/${protocol === 'responses' ? 'responses' : 'chat/completions'}`;
          const res = await fetchProvider(url, {
            method: 'POST',
            signal: AbortSignal.timeout(requestTimeout(formConfig)),
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${formConfig.openaiApiKey.trim()}`
            },
            body: JSON.stringify(buildOpenAIRequest(
              formConfig.openaiModel,
              [{ role: 'system', content: translate("Yalnızca geçerli JSON döndür.") }, { role: 'user', content: translate("{\"ok\":true} biçiminde kısa bir JSON döndür.") }],
              formConfig.openaiReasoningEffort,
              protocol
            ))
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
            const detail = err?.error?.message || `HTTP ${res.status}`;
            if (protocol === 'chat-completions' && requiresResponsesApi(res.status, detail)) {
              protocol = 'responses';
              continue;
            }
            throw new Error(detail);
          }

          const responseData: unknown = await res.json();
          const answer = extractOpenAIText(responseData, protocol);
          JSON.parse(answer);
          setFormConfig(prev => ({ ...prev, openaiProtocol: protocol }));
          break;
        }

        setTestStatus('success');
        setTestMessage(translate("Bağlantı başarılı! {0} modeli kullanıma hazır.", [formConfig.openaiModel]));
      } catch (err: unknown) {
        setTestStatus('error');
        const msg = err instanceof Error ? err.message : String(err);
        setTestMessage(translate("Bağlantı başarısız: {0}", [msg]));
      }
      return;
    }

    if (formConfig.activeProvider === 'deepseek') {
      if (!formConfig.deepseekApiKey.trim()) {
        setTestStatus('error');
        setTestMessage(translate("Lütfen önce bir DeepSeek API anahtarı girin."));
        return;
      }

      try {
        const url = `${formConfig.deepseekBaseUrl.replace(/\/+$/, '')}/chat/completions`;
        const res = await fetchProvider(url, {
          method: 'POST',
            signal: AbortSignal.timeout(requestTimeout(formConfig)),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${formConfig.deepseekApiKey.trim()}`
          },
          body: JSON.stringify({
            model: formConfig.deepseekModel || 'deepseek-chat',
            messages: [{ role: 'user', content: 'Ping' }],
            max_tokens: 30
          })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
          throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }

        setTestStatus('success');
        setTestMessage(translate("Bağlantı başarılı! DeepSeek ({0}) kullanıma hazır.", [formConfig.deepseekModel]));
      } catch (err: unknown) {
        setTestStatus('error');
        const msg = err instanceof Error ? err.message : String(err);
        setTestMessage(translate("Bağlantı başarısız: {0}", [msg]));
      }
      return;
    }

    if (formConfig.activeProvider === 'openrouter') {
      if (!formConfig.openrouterApiKey.trim()) {
        setTestStatus('error');
        setTestMessage(translate("Lütfen önce bir OpenRouter API anahtarı girin."));
        return;
      }

      try {
        const url = `${formConfig.openrouterBaseUrl.replace(/\/+$/, '')}/chat/completions`;
        const res = await fetchProvider(url, {
          method: 'POST',
            signal: AbortSignal.timeout(requestTimeout(formConfig)),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${formConfig.openrouterApiKey.trim()}`,
            'HTTP-Referer': 'https://katmandu.ai',
            'X-Title': 'KATMANDU'
          },
          body: JSON.stringify({
            model: formConfig.openrouterModel || 'anthropic/claude-sonnet-4.6',
            messages: [{ role: 'user', content: 'Ping' }],
            max_tokens: 15
          })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
          throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }

        setTestStatus('success');
        setTestMessage(translate("Bağlantı başarılı! OpenRouter ({0}) kullanıma hazır.", [formConfig.openrouterModel]));
      } catch (err: unknown) {
        setTestStatus('error');
        const msg = err instanceof Error ? err.message : String(err);
        setTestMessage(translate("Bağlantı başarısız: {0}", [msg]));
      }
      return;
    }

    setTestStatus('success');
    setTestMessage(translate("Kanonik Mock Fixture çevrimdışı ve hazır."));
  };

  return (
    <div className="workspace-modal fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
      <div className="workspace-modal-card spectrum-dialog bg-white dark:bg-panel rounded border border-stone-300 dark:border-stone-800 shadow-xl max-w-xl sm:max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 transition-colors text-stone-900 dark:text-stone-100 max-h-[90vh] overflow-y-auto">
        {/* Başlık */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-900 dark:text-amber-500" />
            <h2 className="text-base font-serif font-bold text-stone-900 dark:text-stone-100">
              {translate("Model ve API Yapılandırması")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={translate("Kapat")}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs font-sans">
          <div className="space-y-2">
            <label htmlFor="app-language" className="font-semibold text-stone-700 dark:text-stone-300 block uppercase tracking-wider text-[11px]">{translate('Uygulama dili')}</label>
            <select id="app-language" value={language} onChange={event => setLanguage(event.target.value as Language)}
              className="w-full p-2.5 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
            </select>
            <p className="text-stone-500">{translate('Dil seçimi hemen kaydedilir. Yeni çözümler bu dilde üretilir; eski kayıtların dili değiştirilmez.')}</p>
          </div>
          {/* Sağlayıcı Seçimi (Açılır Sekme / Menü) */}
          <div>
            <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1.5 uppercase tracking-wider text-[11px]">
              {translate("Aktif Çözüm Motoru (Model Sağlayıcı):")}
            </label>
            <div className="relative">
              <select
                value={formConfig.activeProvider}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    activeProvider: e.target.value as AppConfig['activeProvider'],
                    modelSelectionMode: 'manual'
                  }))
                }
                className="w-full appearance-none px-3 py-2.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded text-xs text-stone-900 dark:text-stone-100 font-medium focus:ring-1 focus:ring-amber-700 focus:border-amber-700 outline-hidden pr-8 cursor-pointer shadow-2xs transition-colors"
              >
                <option value="openrouter">{translate("🌐 OpenRouter (Çok sağlayıcılı model kataloğu)")}</option>
                <option value="gemini">{translate("🌟 Google Gemini (Ücretsiz API • Hızlı & Görsel/PDF Destekli)")}</option>
                <option value="deepseek">{translate("🚀 DeepSeek (Güncel model kataloğu)")}</option>
                <option value="openai">{translate("⚡ OpenAI API (Güncel model kataloğu)")}</option>
                <option value="mock">{translate("📦 Kanonik Mock Fixture (Çevrimdışı Demo)")}</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-stone-400 dark:text-stone-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>
                {formConfig.activeProvider === 'openrouter' && translate("OpenRouter aktif: Hesabınızda kullanılabilir modelleri katalogdan seçebilirsiniz.")}
                {formConfig.activeProvider === 'gemini' && translate("Google Gemini aktif: Hesabınızda kullanılabilir modelleri katalogdan seçebilirsiniz.")}
                {formConfig.activeProvider === 'deepseek' && translate("DeepSeek aktif: Metin ve PDF odaklı, derin matematiksel akıl yürütme.")}
                {formConfig.activeProvider === 'openai' && translate("OpenAI aktif: Hesabınızda kullanılabilir modelleri seçebilirsiniz.")}
                {formConfig.activeProvider === 'mock' && translate("Kanonik Mock aktif: İnternet veya API anahtarı gerektirmeyen çevrimdışı test modu.")}
              </span>
            </div>
          </div>

          {/* OPENROUTER AYARLARI */}
          {formConfig.activeProvider === 'openrouter' && (
            <div className="space-y-3.5 pt-2 border-t border-stone-200 dark:border-stone-800 animate-in fade-in duration-150">
              {/* API Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider text-[11px]">
                    {translate("OpenRouter API Anahtarı:")}</label>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    {translate("Anahtar Al (openrouter.ai/keys)")}<ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-stone-400 dark:text-stone-500">
                    <Key className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={formConfig.openrouterApiKey}
                    onChange={(e) =>
                      setFormConfig((prev) => ({ ...prev, openrouterApiKey: e.target.value }))
                    }
                    placeholder="sk-or-v1-..."
                    className="w-full pl-8 pr-8 py-2 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-1 focus:ring-amber-700 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 cursor-pointer"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-1">
                  {translate("Kullanılabilir modeller ve fiyatları OpenRouter hesabınıza göre değişebilir.")}</div>
              </div>

              <ModelPicker provider="openrouter" config={formConfig} value={formConfig.openrouterModel}
                onChange={(id) => setFormConfig(prev => ({ ...prev, openrouterModel: id }))} />

              {/* Akıl Yürütme Seviyesi (Reasoning / Thinking) */}
              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1.5 uppercase tracking-wider text-[11px]">
                  {translate("Akıl Yürütme Seviyesi (Thinking Effort):")}</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFormConfig((prev) => ({
                        ...prev,
                        openrouterReasoningEffort: 'low'
                      }))
                    }
                    className={`p-2.5 rounded border text-left transition-all cursor-pointer ${
                      formConfig.openrouterReasoningEffort === 'low'
                        ? 'border-amber-700 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 font-semibold text-amber-950 dark:text-amber-200 ring-1 ring-amber-600'
                        : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span>{translate("Düşük (Low)")}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-medium">
                        {translate("⭐ Ekonomik")}</span>
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-1">
                      {translate("Daha az akıl yürütme kullanır.")}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormConfig((prev) => ({
                        ...prev,
                        openrouterReasoningEffort: 'medium'
                      }))
                    }
                    className={`p-2.5 rounded border text-left transition-all cursor-pointer ${
                      formConfig.openrouterReasoningEffort === 'medium'
                        ? 'border-amber-700 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 font-semibold text-amber-950 dark:text-amber-200 ring-1 ring-amber-600'
                        : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span>{translate("Orta (Medium)")}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-medium">
                        {translate("Dengeli")}</span>
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-1">
                      {translate("Dengeli akıl yürütme kullanır.")}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormConfig((prev) => ({
                        ...prev,
                        openrouterReasoningEffort: 'high'
                      }))
                    }
                    className={`p-2.5 rounded border text-left transition-all cursor-pointer ${
                      formConfig.openrouterReasoningEffort === 'high'
                        ? 'border-amber-700 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 font-semibold text-amber-950 dark:text-amber-200 ring-1 ring-amber-600'
                        : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span>{translate("Yüksek (High)")}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-medium">
                        {translate("Maksimum")}</span>
                    </div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-1">
                      {translate("Daha fazla akıl yürütme kullanır.")}</div>
                  </button>
                </div>
                <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-1">
                  {translate("Gerçek maliyet seçilen modelin güncel fiyatına ve tüketilen token sayısına bağlıdır.")}</div>
              </div>

              {/* Base URL */}
              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1 uppercase tracking-wider text-[11px]">
                  API Base URL:
                </label>
                <input
                  type="text"
                  value={formConfig.openrouterBaseUrl}
                  onChange={(e) =>
                    setFormConfig((prev) => ({ ...prev, openrouterBaseUrl: e.target.value }))
                  }
                  placeholder="https://openrouter.ai/api/v1"
                  className="w-full p-2 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 focus:ring-1 focus:ring-amber-700 outline-hidden"
                />
              </div>

              {/* Bağlantı Sınama */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="text-[11px] text-amber-900 dark:text-amber-400 hover:underline font-medium"
                >
                  {testStatus === 'testing' ? translate("OpenRouter Sınanıyor...") : translate("OpenRouter Bağlantısını Sına")}
                </button>

                {testStatus === 'success' && (
                  <div className="mt-1.5 p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{testMessage}</span>
                  </div>
                )}

                {testStatus === 'error' && (
                  <div className="mt-1.5 p-2 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-300 flex items-start gap-1.5 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <span>{testMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GOOGLE GEMINI AYARLARI */}
          {formConfig.activeProvider === 'gemini' && (
            <div className="space-y-3 pt-2 border-t border-stone-200 dark:border-stone-800 animate-in fade-in duration-150">
              {/* Gemini API Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider text-[11px]">
                    {translate("Google Gemini API Anahtarı:")}</label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-amber-800 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <span>{translate("Ücretsiz Anahtar Al (Google AI Studio)")}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-stone-400 dark:text-stone-500">
                    <Key className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={formConfig.geminiApiKey}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, geminiApiKey: e.target.value }))}
                    placeholder="AIzaSy..."
                    className="w-full pl-8 pr-8 py-2 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-1 focus:ring-amber-700 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <ModelPicker provider="gemini" config={formConfig} value={formConfig.geminiModel}
                onChange={(id) => setFormConfig(prev => ({ ...prev, geminiModel: id }))} />
              <div>
                <label className="font-medium text-stone-600 dark:text-stone-400 block mb-1 text-[10px]">{translate("Akıl Yürütme Seviyesi")}</label>
                <select value={formConfig.geminiThinkingLevel} onChange={(e) => setFormConfig(prev => ({ ...prev, geminiThinkingLevel: e.target.value as 'low' | 'medium' | 'high' }))}
                  className="w-full p-2 border border-stone-300 dark:border-stone-700 rounded bg-white dark:bg-stone-900">
                  <option value="low">{translate("Düşük")}</option><option value="medium">{translate("Orta")}</option><option value="high">{translate("Yüksek")}</option>
                </select>
              </div>

              {/* Bilgilendirme Notu */}
              <div className="p-2.5 rounded bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 text-[11px] text-emerald-900 dark:text-emerald-300 font-sans leading-relaxed">
                {translate("Kullanım kotası, bağlam penceresi ve fiyat seçilen modele ve hesabınızın güncel planına bağlıdır.")}</div>

              {/* Bağlantı Sınama */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="text-[11px] text-amber-900 dark:text-amber-400 hover:underline font-medium"
                >
                  {testStatus === 'testing' ? translate("Gemini Sınanıyor...") : translate("Gemini Bağlantısını Sına")}
                </button>

                {testStatus === 'success' && (
                  <div className="mt-1.5 p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{testMessage}</span>
                  </div>
                )}

                {testStatus === 'error' && (
                  <div className="mt-1.5 p-2 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-300 flex items-start gap-1.5 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <span>{testMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DEEPSEEK AYARLARI */}
          {formConfig.activeProvider === 'deepseek' && (
            <div className="space-y-3 pt-2 border-t border-stone-200 dark:border-stone-800 animate-in fade-in duration-150">
              {/* DeepSeek API Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider text-[11px]">
                    {translate("DeepSeek API Anahtarı:")}</label>
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-amber-800 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <span>{translate("API Anahtarı Al (DeepSeek Platform)")}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-stone-400 dark:text-stone-500">
                    <Key className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={formConfig.deepseekApiKey}
                    onChange={(e) =>
                      setFormConfig((prev) => ({ ...prev, deepseekApiKey: e.target.value }))
                    }
                    placeholder="sk-..."
                    className="w-full pl-8 pr-8 py-2 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-1 focus:ring-amber-700 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <ModelPicker provider="deepseek" config={formConfig} value={formConfig.deepseekModel}
                onChange={(id) => setFormConfig(prev => ({ ...prev, deepseekModel: id }))} />

              {/* Endpoint (Base URL) */}
              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1 uppercase tracking-wider text-[11px]">
                  API Base URL:
                </label>
                <input
                  type="text"
                  value={formConfig.deepseekBaseUrl}
                  onChange={(e) =>
                    setFormConfig((prev) => ({ ...prev, deepseekBaseUrl: e.target.value }))
                  }
                  placeholder="https://api.deepseek.com"
                  className="w-full p-2 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 focus:ring-1 focus:ring-amber-700 outline-hidden"
                />
              </div>

              {/* Format Bilgilendirme Notu */}
              <div className="p-2.5 rounded bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">{translate("Format ve Girdi Desteği:")}</strong>  {translate("DeepSeek şu an doğrudan")} <strong>{translate("Elle Giriş (Metin / LaTeX)")}</strong>  {translate("ve")} <strong>{translate("PDF Belgesi")}</strong> {translate("formatlarını destekler. Görsel (fotoğraf) ile giriş yapıldığında uyarı verilir; görselden DeepSeek hibrit OCR desteği bir sonraki sürümde eklenecektir.")}</div>
              </div>

              {/* Bağlantı Sınama */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="text-[11px] text-amber-900 dark:text-amber-400 hover:underline font-medium"
                >
                  {testStatus === 'testing' ? translate("DeepSeek Sınanıyor...") : translate("DeepSeek Bağlantısını Sına")}
                </button>

                {testStatus === 'success' && (
                  <div className="mt-1.5 p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{testMessage}</span>
                  </div>
                )}

                {testStatus === 'error' && (
                  <div className="mt-1.5 p-2 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-300 flex items-start gap-1.5 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <span>{testMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OPENAI AYARLARI */}
          {formConfig.activeProvider === 'openai' && (
            <div className="space-y-3 pt-2 border-t border-stone-200 dark:border-stone-800 animate-in fade-in duration-150">
              {/* API Key */}
              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1 uppercase tracking-wider text-[11px]">
                  {translate("OpenAI API Anahtarı:")}</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-stone-400 dark:text-stone-500">
                    <Key className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={formConfig.openaiApiKey}
                    onChange={(e) => setFormConfig((prev) => ({ ...prev, openaiApiKey: e.target.value }))}
                    placeholder="sk-proj-..."
                    className="w-full pl-8 pr-8 py-2 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-1 focus:ring-amber-700 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <ModelPicker provider="openai" config={formConfig} value={formConfig.openaiModel}
                onChange={(id) => setFormConfig(prev => ({ ...prev, openaiModel: id }))} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[10px] block mb-1">{translate("API protokolü")}</label>
                  <select value={formConfig.openaiProtocol || 'chat-completions'}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, openaiProtocol: e.target.value as 'chat-completions' | 'responses' }))}
                    className="w-full p-2 border border-stone-300 dark:border-stone-700 rounded bg-white dark:bg-stone-900">
                    <option value="chat-completions">Chat Completions</option>
                    <option value="responses">Responses API</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[10px] block mb-1">{translate("Akıl yürütme seviyesi")}</label>
                  <select value={formConfig.openaiReasoningEffort}
                    onChange={(e) => setFormConfig(prev => ({ ...prev, openaiReasoningEffort: e.target.value as 'low' | 'medium' | 'high' }))}
                    className="w-full p-2 border border-stone-300 dark:border-stone-700 rounded bg-white dark:bg-stone-900">
                    <option value="low">{translate("Düşük")}</option><option value="medium">{translate("Orta")}</option><option value="high">{translate("Yüksek")}</option>
                  </select>
                </div>
              </div>

              {/* Base URL */}
              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1 uppercase tracking-wider text-[11px]">
                  API Base URL:
                </label>
                <input
                  type="text"
                  value={formConfig.openaiBaseUrl}
                  onChange={(e) => setFormConfig((prev) => ({ ...prev, openaiBaseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className="w-full p-2 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 focus:ring-1 focus:ring-amber-700 outline-hidden"
                />
              </div>

              {/* Bağlantı Sınama Butonu ve Durum */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="text-[11px] text-stone-600 dark:text-stone-400 hover:text-amber-900 dark:hover:text-amber-300 underline font-medium"
                >
                  {testStatus === 'testing' ? translate("OpenAI Sınanıyor...") : translate("OpenAI Bağlantısını Sına")}
                </button>

                {testStatus === 'success' && (
                  <div className="mt-1.5 p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{testMessage}</span>
                  </div>
                )}

                {testStatus === 'error' && (
                  <div className="mt-1.5 p-2 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-300 flex items-start gap-1.5 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <span>{testMessage}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KANONİK MOCK AYARLARI */}
          {formConfig.activeProvider === 'mock' && (
            <div className="p-3 rounded bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed animate-in fade-in duration-150">
              {translate("Kanonik Mock Fixture modu; herhangi bir API anahtarı veya internet bağlantısı gerektirmeden tam deterministik sarkaç ve Lagrange kısıt çözümlerini test etmenizi sağlar.")}</div>
          )}

          <fieldset className="space-y-2 border-t border-stone-200 dark:border-stone-800 pt-3">
            <legend className="text-xs font-semibold">{translate("İşlem sınırları")}</legend>
            <label className="flex items-center justify-between text-xs gap-3">{translate("Aynı anda çalışacak işlem")}<select aria-label={translate("Aynı anda çalışacak işlem")} value={formConfig.maxConcurrentRequests || 2}
                onChange={e => setFormConfig(prev => ({ ...prev, maxConcurrentRequests: Number(e.target.value) }))}
                className="bg-stone-100 dark:bg-stone-900 rounded p-1">
                {[1, 2, 3, 4].map(count => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between text-xs gap-3">{translate("İşlem zaman aşımı (saniye)")}<input aria-label={translate("İşlem zaman aşımı")} type="number" min="30" max="900" step="30"
                value={formConfig.requestTimeoutSeconds ?? 300}
                onChange={e => setFormConfig(prev => ({ ...prev, requestTimeoutSeconds: Math.max(30, Math.min(900, Number(e.target.value))) }))}
                className="w-20 bg-stone-100 dark:bg-stone-900 rounded p-1" />
            </label>
            <label className="flex items-center justify-between text-xs gap-3">{translate("Soru başına tahmini harcama sınırı (USD)")}<input aria-label={translate("Soru başına tahmini harcama sınırı")} type="number" min="0" step="0.1"
                value={formConfig.maxCostPerQuestionUsd ?? 0}
                onChange={e => setFormConfig(prev => ({ ...prev, maxCostPerQuestionUsd: Math.max(0, Number(e.target.value)) }))}
                className="w-20 bg-stone-100 dark:bg-stone-900 rounded p-1" />
            </label>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">{translate("0 harcama sınırını kapatır. Sınır açıkken fiyatı bilinmeyen modeller kullanılmaz; toplam maliyet tahminini aşan yeni çağrılar durdurulur. Gerçek fatura tahminden farklı olabilir. Durdurmak, sağlayıcının zaten işlediği isteğin ücretini geri almaz.")}</p>
          </fieldset>

          {/* Güvenlik Bilgilendirmesi */}
          <div className="flex items-start gap-2 p-2.5 rounded bg-stone-50 dark:bg-panel border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 text-[11px] leading-relaxed">
            <Shield className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
            <span>
              {translate("API anahtarlarınız yalnızca yerel tarayıcınızda (localStorage) saklanır ve doğrudan ilgili sağlayıcının (Google / OpenAI) resmi uç noktasına iletilir.")}</span>
          </div>

          {/* Butonlar */}
          <div className="flex items-center justify-between pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setFormConfig(DEFAULT_CONFIG)}
              className="text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 text-xs"
            >
              {translate("Varsayılana Sıfırla")}</button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition-colors"
              >
                {translate("Vazgeç")}</button>
              <button
                type="submit"
                className="spectrum-primary-action px-4 py-1.5 bg-amber-800 dark:bg-amber-700 hover:bg-amber-900 dark:hover:bg-amber-800 text-white rounded font-medium shadow-2xs transition-colors"
              >
                {translate("Kaydet ve Uygula")}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
