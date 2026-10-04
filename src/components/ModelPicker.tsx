import { getLocale } from '../i18n';
import { translate } from '../i18n';
import { useEffect, useId, useMemo, useState } from 'react';
import type { AppConfig } from '../domain/config';
import { fetchModelCatalog, modelCompanyId, modelCompanyName, readCachedModels, type LiveProvider, type ModelDescriptor } from '../domain/modelCatalog';

interface ModelPickerProps {
  provider: LiveProvider;
  config: AppConfig;
  value: string;
  onChange: (id: string, descriptor?: ModelDescriptor) => void;
}

export function ModelPicker({ provider, config, value, onChange }: ModelPickerProps) {
  const inputId = useId();
  const [models, setModels] = useState(() => readCachedModels(config, provider));
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState(() => provider === 'openrouter' && value ? modelCompanyId(value) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const key = provider === 'openai' ? config.openaiApiKey : provider === 'gemini' ? config.geminiApiKey
    : provider === 'deepseek' ? config.deepseekApiKey : config.openrouterApiKey;

  useEffect(() => {
    setModels(readCachedModels(config, provider));
    setSearch('');
    setCompany(provider === 'openrouter' && value ? modelCompanyId(value) : '');
    setError('');
  }, [provider, key, config.openaiBaseUrl, config.deepseekBaseUrl, config.openrouterBaseUrl]);

  useEffect(() => {
    if (!key.trim() && provider !== 'openrouter') return;
    let active = true;
    const timer = setTimeout(() => {
      void fetchModelCatalog(config, provider).then(result => {
        if (active) setModels(result);
      }).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [provider, key, config.openaiBaseUrl, config.deepseekBaseUrl, config.openrouterBaseUrl]);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setModels(await fetchModelCatalog(config, provider, true));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const companies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models) {
      const id = modelCompanyId(model.id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    if (company && !counts.has(company)) counts.set(company, 0);
    return [...counts].sort(([a], [b]) => modelCompanyName(a).localeCompare(modelCompanyName(b), getLocale()));
  }, [models, company]);

  const matchingModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return models.filter(model => (provider !== 'openrouter' || (company && modelCompanyId(model.id) === company)) &&
      (!query || `${model.name} ${model.id}`.toLowerCase().includes(query)));
  }, [models, provider, company, search]);
  const visibleModels = matchingModels.slice(0, 100);
  const selected = models.find(model => model.id === value);

  return (
    <div className="space-y-2 rounded border border-stone-200 dark:border-stone-800 p-3 bg-stone-50/60 dark:bg-stone-900/30">
      <div className="flex justify-between items-center gap-2">
        <span className="font-semibold text-[11px] uppercase tracking-wider">{translate("Model seçimi")}</span>
        <button type="button" onClick={refresh} disabled={loading} className="text-amber-800 dark:text-amber-400 underline disabled:opacity-50">
          {loading ? translate("Yükleniyor…") : translate("Model listesini yenile")}
        </button>
      </div>

      {provider === 'openrouter' && (
        <div>
          <label htmlFor={`${inputId}-company`} className="block font-semibold text-[10px] mb-1">{translate("Önce şirket seçin")}</label>
          <select id={`${inputId}-company`} value={company} onChange={event => { setCompany(event.target.value); setSearch(''); }}
            className="w-full p-2 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
            <option value="">{translate("Şirket seçin…")}</option>
            {companies.map(([id, count]) => <option key={id} value={id}>{modelCompanyName(id)} ({count})</option>)}
          </select>
        </div>
      )}

      <label htmlFor={`${inputId}-search`} className="block font-semibold text-[10px]">{provider === 'openrouter' ? translate("Sonra model seçin") : translate("Model ara")}</label>
      <input id={`${inputId}-search`} type="search" value={search} onChange={event => setSearch(event.target.value)}
        disabled={provider === 'openrouter' && !company}
        placeholder={provider === 'openrouter' ? translate("Seçilen şirketin modellerinde ara…") : translate("Hesabınızda kullanılabilir modellerde ara…")}
        className="w-full p-2 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900" />

      <div className="max-h-40 overflow-y-auto rounded border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        {visibleModels.length ? visibleModels.map(model => (
          <button key={model.id} type="button" onClick={() => onChange(model.id, model)}
            className={`w-full text-left px-2 py-1.5 border-b border-stone-100 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 ${value === model.id ? 'text-amber-900 dark:text-amber-300 font-semibold' : ''}`}>
            <span className="block truncate">{model.name}{model.id.startsWith('~') ? translate(" · Güncel sürüm takma adı") : ''}</span>
            <span className="block truncate font-mono text-[10px] text-stone-500">{model.id}{model.contextWindow ? translate(" · {0}k bağlam", [Math.round(model.contextWindow / 1000)]) : ''}</span>
          </button>
        )) : <div className="p-2 text-stone-500">{provider === 'openrouter' && !company ? translate("Modelleri görmek için şirket seçin.") : models.length ? translate("Eşleşen model yok.") : translate("Canlı model listesi henüz alınmadı.")}</div>}
      </div>
      {matchingModels.length > 100 && <p className="text-stone-500">{matchingModels.length}  {translate("sonuçtan ilk 100'ü gösteriliyor; arayarak diğerlerine ulaşabilirsiniz.")}</p>}
      {provider === 'openrouter' && <p className="text-stone-500">{translate("Başında ~ olan kimlikler OpenRouter'ın güncel sürüme yönlenen model takma adlarıdır. Seçilen gerçek sürüm zamanla değişebilir.")}</p>}
      {error && <p role="status" className="text-rose-700 dark:text-rose-400">{error}{models.length ? translate(" Son kayıtlı liste gösteriliyor.") : ''}</p>}
      <label className="block font-semibold text-[10px]">{translate("Özel model kimliği")}</label>
      <input type="text" value={value} onChange={event => onChange(event.target.value)}
        className="w-full p-2 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono"
        placeholder={translate("Sağlayıcının model kimliğini yazın")} />
      {selected?.inputModalities && <p className="text-stone-500">{translate("Girdi:")} {selected.inputModalities.join(', ')}</p>}
      {selected?.priceInputPerMillion !== undefined && selected?.priceOutputPerMillion !== undefined &&
        <p className="text-stone-500">{translate("Katalog fiyatı (1 milyon token): girdi $")}{selected.priceInputPerMillion}{translate(", çıktı $")}{selected.priceOutputPerMillion}{translate(". Gerçek ücret sağlayıcının güncel fiyatına ve kullanıma bağlıdır.")}</p>}
    </div>
  );
}
