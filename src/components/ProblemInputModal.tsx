import { translate } from '../i18n';
import React, { useState } from 'react';
import { X, BookCheck, PlusCircle } from 'lucide-react';
import { ProblemInputTabs, ProblemSubmitPayload } from './ProblemInputTabs';
import { ProblemAttachment } from '../domain/types';
import { detectMultipleQuestions } from '../domain/questionParser';

export interface SubmitProblemOptions {
  openInNewTab?: boolean;
}

interface ProblemInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitProblem: (
    payload: { text: string; attachments?: ProblemAttachment[] },
    options?: SubmitProblemOptions
  ) => void;
  onSubmitMultipleProblems?: (
    payloads: Array<{ text: string; attachments?: ProblemAttachment[] }>
  ) => void;
  isLoading?: boolean;
  hasExistingTabs?: boolean;
  activeProvider?: 'mock' | 'openai' | 'gemini' | 'deepseek' | 'openrouter';
}

/**
 * ProblemInputModal:
 * Yeni bilimsel problem girişi (Elle yazım / LaTeX, JPG-PNG Görsel veya PDF).
 * Tekil veya çoklu soru tespitini ve sekmeli açılışı destekler.
 */
export const ProblemInputModal: React.FC<ProblemInputModalProps> = ({
  isOpen,
  onClose,
  onSubmitProblem,
  onSubmitMultipleProblems,
  isLoading = false,
  hasExistingTabs = false,
  activeProvider
}) => {
  const [openInNewTab, setOpenInNewTab] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleSubmit = (payload: ProblemSubmitPayload) => {
    // 1. Çoklu dosya yüklendi ve sekmelere ayırma seçildiyse:
    if (
      payload.splitFilesIntoTabs &&
      payload.attachments &&
      payload.attachments.length > 1 &&
      onSubmitMultipleProblems
    ) {
      const batchPayloads = payload.attachments.map((att, idx) => ({
        text: payload.text
          ? translate("{0} (Soru {1}: {2})", [payload.text, idx + 1, att.name])
          : translate("Görsel / Doküman Problemi: {0}", [att.name]),
        attachments: [att]
      }));
      onSubmitMultipleProblems(batchPayloads);
      onClose();
      return;
    }

    // 2. Metin içinde çoklu soru tespiti
    const detected = detectMultipleQuestions(payload.text);

    if (detected.length > 1 && onSubmitMultipleProblems) {
      // Çoklu soru tespit edildi: her biri için ayrı sekme aç
      const batchPayloads = detected.map((qText) => ({
        text: qText,
        attachments: payload.attachments
      }));
      onSubmitMultipleProblems(batchPayloads);
      onClose();
      return;
    }

    // 3. Tek soru girişi
    onSubmitProblem(payload, { openInNewTab: hasExistingTabs ? openInNewTab : false });
    onClose();
  };

  return (
    <div className="workspace-modal fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
      <div className="workspace-modal-card bg-white dark:bg-panel rounded-xl border border-stone-300 dark:border-stone-800 shadow-xl max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 transition-colors text-stone-900 dark:text-stone-100 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800 mb-4">
          <div className="flex items-center gap-2">
            <BookCheck className="w-5 h-5 text-amber-800 dark:text-amber-500" />
            <h2 className="text-lg font-serif font-bold text-stone-900 dark:text-stone-100">
              {translate("Yeni Bilimsel Problem & Teori Girişi")}</h2>
          </div>
          <button
            aria-label={translate("Kapat")}
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded p-1 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Çoklu Soru / Yeni Sekme Seçenekleri */}
        {hasExistingTabs && (
          <div className="mb-4 p-2.5 rounded-lg bg-stone-50 dark:bg-[#252420] border border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs font-sans">
            <label className="flex items-center gap-2 cursor-pointer text-stone-700 dark:text-stone-300">
              <input
                type="checkbox"
                checked={openInNewTab}
                onChange={(e) => setOpenInNewTab(e.target.checked)}
                className="rounded text-amber-700 focus:ring-amber-600"
              />
              <span className="flex items-center gap-1 font-medium">
                <PlusCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                {translate("Bu çalışmayı yeni bir sekmede aç (Mevcut çalışmayı koru)")}</span>
            </label>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              {translate("İpucu: Soruları veya konuları")}<code className="font-mono bg-stone-200 dark:bg-stone-700 px-1 rounded">---</code> {translate("ile ayırarak toplu da girebilirsiniz.")}</span>
          </div>
        )}

        <ProblemInputTabs
          onSubmit={handleSubmit}
          isLoading={isLoading}
          submitButtonText={translate("Bilimsel Analizi / Çözümü Başlat")}
          activeProvider={activeProvider}
        />
      </div>
    </div>
  );
};
