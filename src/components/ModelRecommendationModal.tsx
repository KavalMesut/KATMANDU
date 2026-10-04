import { translate } from '../i18n';
import type { ModelRecommendation } from '../domain/modelRecommendation';

interface Props {
  recommendation: ModelRecommendation;
  selectedId: string;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ModelRecommendationModal({ recommendation, selectedId, onSelect, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="recommendation-title"
        className="w-full max-w-lg rounded-xl border border-stone-300 dark:border-stone-700 bg-[#faf6ee] dark:bg-panel p-5 shadow-xl space-y-4 font-sans text-sm">
        <h2 id="recommendation-title" className="font-serif text-xl font-bold">{translate("Önerilen çözüm modeli")}</h2>
        <p className="text-stone-600 dark:text-stone-300">{recommendation.reason}</p>
        <p className="text-xs text-stone-500">{translate("Öneriyi yapan:")} {recommendation.routerLabel}{translate(". Çözüm başlamadan modeli değiştirebilirsiniz.")}</p>
        {recommendation.taskSummary && <p className="text-xs text-stone-600 dark:text-stone-300">{recommendation.taskSummary}</p>}
        {recommendation.costNote && <p className="text-xs text-amber-800 dark:text-amber-300">{recommendation.costNote}</p>}
        <fieldset className="space-y-2 max-h-64 overflow-y-auto">
          <legend className="font-semibold mb-2">{translate("Çözümü yapacak model")}</legend>
          {recommendation.choices.map(choice => (
            <label key={choice.id} className={`flex gap-2 items-start rounded border p-2 cursor-pointer ${selectedId === choice.id ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/30' : 'border-stone-300 dark:border-stone-700'}`}>
              <input type="radio" name="solution-model" value={choice.id} checked={selectedId === choice.id} onChange={() => onSelect(choice.id)} />
              <span><span className="block font-medium">{choice.label}{choice.id === recommendation.suggestedId ? translate(" · Önerilen") : ''}</span>
                <span className="block text-xs text-stone-500">{choice.priceInputPerMillion !== undefined && choice.priceOutputPerMillion !== undefined
                  ? translate("Katalog fiyatı / 1M token: girdi ${0}, çıktı ${1}", [choice.priceInputPerMillion, choice.priceOutputPerMillion])
                  : translate("Güncel fiyat bilgisi katalogda yok")}</span>
                {choice.fit && <span className="block text-xs text-stone-500">{translate("Göreve uygunluk:")} {{ strong: translate("güçlü"), adequate: translate("yeterli"), uncertain: translate("belirsiz"), inadequate: 'yetersiz' }[choice.fit]}</span>}
                {choice.estimatedCost !== undefined && <span className="block text-xs text-stone-500">{translate("Tahmini çözüm çağrısı: $")}{choice.estimatedCost.toFixed(4)}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 rounded border border-stone-300 dark:border-stone-700">{translate("Vazgeç")}</button>
          <button type="button" onClick={onConfirm} className="px-3 py-2 rounded bg-amber-800 text-white">{translate("Bu modelle çöz")}</button>
        </div>
      </div>
    </div>
  );
}
