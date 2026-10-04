import { translate } from '../i18n';
import React, { useState, useRef } from 'react';
import {
  FileText,
  Image as ImageIcon,
  FileUp,
  X,
  Sparkles,
  Eye,
  EyeOff,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Calculator
} from 'lucide-react';
import { ProblemAttachment } from '../domain/types';
import { KaTeXRenderer } from './KaTeXRenderer';

export type InputMode = 'text' | 'image' | 'pdf';

export interface ProblemSubmitPayload {
  text: string;
  attachments?: ProblemAttachment[];
  splitFilesIntoTabs?: boolean;
}

interface ProblemInputTabsProps {
  onSubmit: (payload: ProblemSubmitPayload) => void;
  isLoading?: boolean;
  compact?: boolean;
  initialText?: string;
  submitButtonText?: string;
  activeProvider?: 'mock' | 'openai' | 'gemini' | 'deepseek' | 'openrouter';
}

export const ProblemInputTabs: React.FC<ProblemInputTabsProps> = ({
  onSubmit,
  isLoading = false,
  compact = false,
  initialText = '',
  submitButtonText = translate("Bilimsel Analizi / Çözümü Başlat"),
  activeProvider = 'gemini'
}) => {
  const [mode, setMode] = useState<InputMode>('image');
  const [textInput, setTextInput] = useState(initialText);
  const [showPreview, setShowPreview] = useState(false);
  const [attachments, setAttachments] = useState<ProblemAttachment[]>([]);
  const [splitFilesIntoTabs, setSplitFilesIntoTabs] = useState<boolean>(true);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // LaTeX Hızlı Ekleme Butonları
  const LATEX_SNIPPETS = [
    { label: '\\theta', insert: '\\theta' },
    { label: '\\frac{a}{b}', insert: '\\frac{a}{b}' },
    { label: '\\int', insert: '\\int_{0}^{t} ' },
    { label: '\\vec{F}', insert: '\\vec{F}' },
    { label: '\\partial', insert: '\\partial ' },
    { label: '\\sqrt{}', insert: '\\sqrt{}' },
    { label: '\\ddot{x}', insert: '\\ddot{x}' },
    { label: '$...$', insert: '$ $', offset: 2 }
  ];

  const handleInsertSnippet = (snippet: { insert: string; offset?: number }) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setTextInput((prev) => prev + snippet.insert);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textInput;
    const updated = current.substring(0, start) + snippet.insert + current.substring(end);
    setTextInput(updated);

    setTimeout(() => {
      textarea.focus();
      const cursor = snippet.offset ? start + snippet.offset : start + snippet.insert.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const processFiles = (files: FileList | File[]) => {
    setFileError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const MAX_SIZE = 15 * 1024 * 1024;
    const errors: string[] = [];

    fileArray.forEach((file, index) => {
      if (file.size > MAX_SIZE) {
        errors.push(translate("\"{0}\" boyutu 15 MB sınırını aşıyor.", [file.name]));
        return;
      }

      const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (mode === 'image' && !isImg) {
        errors.push(translate("\"{0}\" geçerli bir görsel formatı (JPG, PNG, WEBP) değil.", [file.name]));
        return;
      }

      if (mode === 'pdf' && !isPdf) {
        errors.push(translate("\"{0}\" geçerli bir PDF belgesi değil.", [file.name]));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const newAttachment: ProblemAttachment = {
          id: `att_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          type: mode as 'image' | 'pdf',
          mimeType: file.type || (mode === 'pdf' ? 'application/pdf' : 'image/jpeg'),
          data: result,
          dataUrl: result,
          size: file.size
        };

        setAttachments((prev) => [...prev, newAttachment]);
      };

      reader.onerror = () => {
        setFileError(translate("\"{0}\" okunurken hata oluştu.", [file.name]));
      };

      reader.readAsDataURL(file);
    });

    if (errors.length > 0) {
      setFileError(errors.join(' '));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleClearAttachments = () => {
    setAttachments((prev) => prev.filter((a) => a.type !== mode));
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (activeProvider === 'deepseek' && mode === 'image') {
      setFileError(
        translate("DeepSeek modeli doğrudan görsel (PNG/JPG) analizini desteklememektedir. Lütfen soruyu metin/LaTeX olarak yazın veya PDF belgesi yükleyin (Görselden DeepSeek hibrit çözüm desteği yakında eklenecektir).")
      );
      return;
    }

    if (mode === 'text' && !textInput.trim()) {
      return;
    }

    const currentAttachments = attachments.filter((a) => a.type === mode);
    if (mode !== 'text' && currentAttachments.length === 0 && !textInput.trim()) {
      setFileError(translate("Lütfen en az bir dosya seçin veya açıklama yazın."));
      return;
    }

    onSubmit({
      text: textInput.trim(),
      attachments: mode === 'text' ? undefined : currentAttachments,
      splitFilesIntoTabs: mode !== 'text' && currentAttachments.length > 1 ? splitFilesIntoTabs : false
    });
  };

  const currentModeAttachments = attachments.filter((a) => a.type === mode);

  const isSubmitDisabled =
    (mode === 'text' && !textInput.trim()) ||
    (mode !== 'text' && !textInput.trim() && currentModeAttachments.length === 0) ||
    (mode === 'image' && activeProvider === 'deepseek') ||
    isLoading;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full">
      {/* Sekme Seçici (Tabs) - 1. Resim, 2. PDF, 3. Elle Giriş */}
      <div className="flex items-center gap-1 border-b border-stone-200 dark:border-stone-800 pb-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setMode('image');
            setFileError(null);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors cursor-pointer ${
            mode === 'image'
              ? 'bg-amber-100/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>{translate("Resim (Görsel / Şema)")}</span>
          {attachments.filter((a) => a.type === 'image').length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 font-semibold">
              {attachments.filter((a) => a.type === 'image').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('pdf');
            setFileError(null);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors cursor-pointer ${
            mode === 'pdf'
              ? 'bg-amber-100/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
        >
          <FileUp className="w-3.5 h-3.5" />
          <span>{translate("PDF Belgesi")}</span>
          {attachments.filter((a) => a.type === 'pdf').length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100 font-semibold">
              {attachments.filter((a) => a.type === 'pdf').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('text');
            setFileError(null);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors cursor-pointer ${
            mode === 'text'
              ? 'bg-amber-100/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{translate("Elle Giriş (Metin / LaTeX)")}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* MOD 1: ELLE YAZIM (METİN / LATEX) */}
        {mode === 'text' && (
          <div className="space-y-2">
            {/* LaTeX Hızlı Butonlar */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[11px] font-sans text-stone-400 dark:text-stone-500 mr-1 flex items-center gap-1">
                  <Calculator className="w-3 h-3" /> {translate("Formül:")}</span>
                {LATEX_SNIPPETS.map((snip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleInsertSnippet(snip)}
                    className="px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-amber-950/50 text-stone-700 dark:text-stone-300 hover:text-amber-900 dark:hover:text-amber-300 text-xs font-mono border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer"
                  >
                    {snip.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className={`text-[11px] font-sans flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer shrink-0 ${
                  showPreview
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200'
                    : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
                }`}
              >
                {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPreview ? translate("Önizlemeyi Gizle") : translate("Canlı LaTeX Önizle")}</span>
              </button>
            </div>

            {/* Metin Alanı */}
            <textarea
              ref={textareaRef}
              rows={compact ? 3 : 5}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={translate("Fizik probleminizi, matematik sorunuzu veya incelemek istediğiniz teorik konuyu buraya yazın... LaTeX formülleri için $...$ veya $$...$$ kullanabilirsiniz. (Örn: Genelleştirilmiş koordinatları anlat, polar, silindirik ve küresel koordinatlara uygula veya \\theta açısı altında m kütleli cismin hareket denklemini türetiniz.)")}
              className="w-full p-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/60 text-stone-900 dark:text-stone-100 text-sm font-serif focus:outline-hidden focus:ring-1 focus:ring-amber-700 dark:focus:ring-amber-600 focus:border-amber-700 dark:focus:border-amber-600 transition-all resize-y"
            />

            {/* Canlı KaTeX Önizleme */}
            {showPreview && textInput.trim() && (
              <div className="p-3 rounded-lg bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-sm font-serif">
                <div className="text-[10px] font-sans uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold mb-1">
                  {translate("LaTeX Canlı Önizleme:")}</div>
                <KaTeXRenderer content={textInput} />
              </div>
            )}
          </div>
        )}

        {/* MOD 2: RESİM YÜKLEME (JPG / PNG) */}
        {mode === 'image' && (
          <div className="space-y-3">
            {activeProvider === 'deepseek' && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">{translate("DeepSeek Görsel Desteği Uyarısı:")}</div>
                  <p className="text-[11px] leading-relaxed">
                    {translate("DeepSeek modeli şu anda sadece")}<strong>{translate("Elle Giriş (Metin / LaTeX)")}</strong>  {translate("ve")} <strong>{translate("PDF Belgesi")}</strong>  {translate("formatlarını desteklemektedir. Görsel ve fotoğraf içeren soruları çözmek için lütfen yukarıdaki sekmelerden")} <strong>PDF</strong>  {translate("veya")} <strong>{translate("Elle Giriş")}</strong>{translate("'i seçin ya da Ayarlar'dan")} <strong>Google Gemini</strong>  {translate("modeline geçin.")} <em>{translate("(Görselden DeepSeek hibrit OCR desteği yakında eklenecektir.)")}</em>
                  </p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            {currentModeAttachments.length === 0 ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-stone-300 dark:border-stone-700 hover:border-amber-600 hover:bg-stone-50 dark:hover:bg-stone-900/50'
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="p-2.5 rounded-full bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-sans font-semibold text-stone-800 dark:text-stone-200">
                      {translate("Soru görselini buraya sürükleyin veya seçmek için tıklayın")}</span>
                    <p className="text-[11px] font-sans text-stone-400 dark:text-stone-500 mt-0.5">
                      {translate("JPG, PNG formatları •")}<b>{translate("Birden fazla resim seçebilirsiniz")}</b> {translate("(Maksimum 15 MB)")}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="font-medium text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                    <span>{currentModeAttachments.length}  {translate("Görsel Seçildi")}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-amber-800 dark:text-amber-400 hover:underline text-[11px] font-medium cursor-pointer"
                    >
                      {translate("+ Başka Görsel Ekle")}</button>
                    <span className="text-stone-300 dark:text-stone-700">|</span>
                    <button
                      type="button"
                      onClick={handleClearAttachments}
                      className="text-rose-600 dark:text-rose-400 hover:underline text-[11px] cursor-pointer"
                    >
                      {translate("Tümünü Kaldır")}</button>
                  </div>
                </div>

                {/* Çoklu Dosya Sekme Bölme Seçeneği */}
                {currentModeAttachments.length > 1 && (
                  <label className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={splitFilesIntoTabs}
                      onChange={(e) => setSplitFilesIntoTabs(e.target.checked)}
                      className="mt-0.5 rounded text-amber-800 focus:ring-amber-700"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-amber-950 dark:text-amber-200">
                        {translate("Her görseli ayrı bir soru sekmesinde (Soru 1, Soru 2, ...) bağımsız çöz")}</span>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                        {translate("İşaret kaldırılırsa tüm görseller tek bir soruya çok parçalı ekler olarak bağlanır.")}</p>
                    </div>
                  </label>
                )}

                {/* Görsel Kartları Listesi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {currentModeAttachments.map((att, idx) => (
                    <div
                      key={att.id}
                      className="p-2 rounded-lg border border-amber-300/80 dark:border-amber-800/60 bg-amber-50/30 dark:bg-amber-950/20 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {att.dataUrl && (
                          <img
                            src={att.dataUrl}
                            alt={att.name}
                            className="w-10 h-10 object-cover rounded border border-stone-200 dark:border-stone-700 shrink-0 shadow-2xs"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-sans font-medium text-stone-800 dark:text-stone-200 truncate" title={att.name}>
                            <span className="font-mono text-amber-800 dark:text-amber-400 mr-1 font-bold">#{idx + 1}</span>
                            {att.name}
                          </div>
                          <div className="text-[10px] font-sans text-stone-400 dark:text-stone-500">
                            {formatFileSize(att.size)}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors cursor-pointer shrink-0"
                        title={translate("Görseli kaldır")}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Görsele Eşlik Eden İsteğe Bağlı Açıklama */}
            <div>
              <label className="block text-[11px] font-sans text-stone-500 dark:text-stone-400 mb-1">
                {translate("Görsellere dair ek soru veya yönergeniz (İsteğe bağlı):")}</label>
              <textarea
                rows={2}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={translate("Örn: Görsellerdeki soruların / teorik konuların adım adım analitik çözümlerini türetiniz...")}
                className="w-full p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/60 text-stone-900 dark:text-stone-100 text-xs font-serif focus:outline-hidden focus:ring-1 focus:ring-amber-700 dark:focus:ring-amber-600"
              />
            </div>
          </div>
        )}

        {/* MOD 3: PDF DOKÜMANI */}
        {mode === 'pdf' && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {currentModeAttachments.length === 0 ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-stone-300 dark:border-stone-700 hover:border-amber-600 hover:bg-stone-50 dark:hover:bg-stone-900/50'
                }`}
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="p-2.5 rounded-full bg-rose-100/80 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-sans font-semibold text-stone-800 dark:text-stone-200">
                      {translate("PDF dokümanlarını buraya sürükleyin veya seçmek için tıklayın")}</span>
                    <p className="text-[11px] font-sans text-stone-400 dark:text-stone-500 mt-0.5">
                      {translate("Ders notu, sınav sorusu PDF'leri •")}<b>{translate("Birden fazla PDF seçebilirsiniz")}</b> {translate("(Maksimum 15 MB)")}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-sans">
                  <span className="font-medium text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
                    <FileUp className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                    <span>{currentModeAttachments.length}  {translate("PDF Dosyası Seçildi")}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-amber-800 dark:text-amber-400 hover:underline text-[11px] font-medium cursor-pointer"
                    >
                      {translate("+ Başka PDF Ekle")}</button>
                    <span className="text-stone-300 dark:text-stone-700">|</span>
                    <button
                      type="button"
                      onClick={handleClearAttachments}
                      className="text-rose-600 dark:text-rose-400 hover:underline text-[11px] cursor-pointer"
                    >
                      {translate("Tümünü Kaldır")}</button>
                  </div>
                </div>

                {/* Çoklu Dosya Sekme Bölme Seçeneği */}
                {currentModeAttachments.length > 1 && (
                  <label className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={splitFilesIntoTabs}
                      onChange={(e) => setSplitFilesIntoTabs(e.target.checked)}
                      className="mt-0.5 rounded text-amber-800 focus:ring-amber-700"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-rose-950 dark:text-rose-200">
                        {translate("Her PDF dosyasını ayrı bir soru sekmesinde (Soru 1, Soru 2, ...) bağımsız çöz")}</span>
                      <p className="text-[11px] text-rose-800/80 dark:text-rose-300/80 mt-0.5">
                        {translate("İşaret kaldırılırsa tüm PDF'ler tek bir soruya çok parçalı ekler olarak bağlanır.")}</p>
                    </div>
                  </label>
                )}

                {/* PDF Kartları Listesi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {currentModeAttachments.map((att, idx) => (
                    <div
                      key={att.id}
                      className="p-2.5 rounded-lg border border-rose-300/80 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded bg-rose-200 dark:bg-rose-900/80 text-rose-900 dark:text-rose-200 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-sans font-medium text-stone-800 dark:text-stone-200 truncate" title={att.name}>
                            <span className="font-mono text-rose-800 dark:text-rose-400 mr-1 font-bold">#{idx + 1}</span>
                            {att.name}
                          </div>
                          <div className="text-[10px] font-sans text-stone-400 dark:text-stone-500 flex items-center gap-1">
                            <span>{formatFileSize(att.size)}</span>
                            <span>•</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">{translate("Analiz edilebilir")}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors cursor-pointer shrink-0"
                        title={translate("PDF dosyasını kaldır")}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PDF'e Eşlik Eden İsteğe Bağlı Açıklama */}
            <div>
              <label className="block text-[11px] font-sans text-stone-500 dark:text-stone-400 mb-1">
                {translate("PDF dokümanına dair ek soru veya sayfa yönergeniz (İsteğe bağlı):")}</label>
              <textarea
                rows={2}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={translate("Örn: Belgedeki sorunun çözümünü veya incelenen teorik konunun analitik ders atlasını çıkarınız...")}
                className="w-full p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/60 text-stone-900 dark:text-stone-100 text-xs font-serif focus:outline-hidden focus:ring-1 focus:ring-amber-700 dark:focus:ring-amber-600"
              />
            </div>
          </div>
        )}

        {/* Hata Mesajı */}
        {fileError && (
          <div className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{fileError}</span>
          </div>
        )}

        {/* Gönderim Butonu */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] font-sans text-stone-400 dark:text-stone-500">
            {currentModeAttachments.length > 0 ? (
              <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {currentModeAttachments.length === 1 ? (
                  <span>{translate("1 ek dosya hazır (")}{currentModeAttachments[0].name})</span>
                ) : (
                  <span>
                    {currentModeAttachments.length}  {translate("dosya hazır")}{' '}
                    {splitFilesIntoTabs ? translate("({0} ayrı sekmede çözülecek)", [currentModeAttachments.length]) : ''}
                  </span>
                )}
              </span>
            ) : mode === 'text' ? (
              <span>{translate("Düz metin ve LaTeX desteklenir (Çoklu soru için \"---\" ayırıcı kullanabilirsiniz)")}</span>
            ) : (
              <span>{translate("Tek veya birden fazla dosya seçebilirsiniz")}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="spectrum-primary-action px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-xs font-sans font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isLoading ? 'animate-spin' : ''}`} />
            <span>
              {isLoading
                ? translate("Çözümleniyor...")
                : activeProvider === 'deepseek' && mode === 'image'
                ? translate("Görsel Desteklenmiyor (PDF/Elle Giriş)")
                : submitButtonText}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
