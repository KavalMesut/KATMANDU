import { getLocale } from '../i18n';
import { translate } from '../i18n';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LibrarySummary } from '../domain/librarySummary';
import {
  BookOpen,
  Search,
  X,
  Trash2,
  Calendar,
  Layers,
  ChevronLeft,
  Atom,
  Binary,
  Plus
} from 'lucide-react';

interface LibraryPanelProps {
  hidden?: boolean;
  storageMessage?: string;
  storageError?: boolean;
  isOpen: boolean;
  onClose: () => void;
  items: LibrarySummary[];
  activeItemId: string | null;
  onSelectItem: (item: LibrarySummary) => void;
  onDeleteItem: (id: string) => void;
  onNewQuestion: () => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  hidden = false,
  storageMessage,
  storageError,
  isOpen,
  onClose,
  items,
  activeItemId,
  onSelectItem,
  onDeleteItem,
  onNewQuestion
}) => {
  // Panel Genişliği ve Boyutlandırma (Resize) Durumu
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('katmandu_library_width');
      return saved ? Math.max(240, Math.min(550, parseInt(saved, 10))) : 320;
    } catch {
      return 320;
    }
  });

  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(320);

  // Arama ve Filtre Durumları
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<'all' | 'fizik' | 'matematik'>('all');

  // Fare sürükleme ile boyutlandırma
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Sağa çektikçe panel genişler, sola çektikçe daralır
      const delta = e.clientX - startXRef.current;
      const maxAllowed = Math.round(window.innerWidth * 0.5);
      const newWidth = Math.max(240, Math.min(maxAllowed, startWidthRef.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('katmandu_library_width', String(panelWidth));
      } catch {}
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, panelWidth]);

  // Filtrelenmiş Liste
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Bilim dalı filtresi
      if (selectedDiscipline !== 'all' && item.discipline !== selectedDiscipline) {
        return false;
      }

      // Arama sorgusu
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesText = item.problemText.toLowerCase().includes(q);
        const matchesCategory = (item.category.toLowerCase().includes(q) || translate(item.category).toLowerCase().includes(q));
        const matchesTags = item.tags.some((t) => (t.toLowerCase().includes(q) || translate(t).toLowerCase().includes(q)));

        return matchesTitle || matchesText || matchesCategory || matchesTags;
      }

      return true;
    });
  }, [items, selectedDiscipline, searchQuery]);

  useEffect(() => { setPage(0); }, [searchQuery, selectedDiscipline]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleItems = filteredItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  // Tarih formatlayıcı
  const formatDate = (ts: number) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(getLocale(), {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      hidden={hidden}
      data-workspace-panel="library"
      aria-label={translate("Bilimsel Kütüphane ve Çözüm Geçmişi")}
      style={{ width: `${panelWidth}px` }}
      className="workspace-library relative shrink-0 flex flex-col h-full select-none bg-[#f8f5eb] dark:bg-canvas border-r border-[#e4dcce] dark:border-stone-800 transition-[width] duration-0 z-20"
    >
      {/* Üst Başlık Çubuğu */}
      <div className="p-3.5 border-b border-[#e4dcce] dark:border-stone-800 bg-[#f3ede0]/90 dark:bg-canvas backdrop-blur-md shrink-0 flex items-center justify-between gap-2">
        <div className="spectrum-library-heading flex items-center gap-2 min-w-0">
          <BookOpen className="w-4 h-4 text-amber-800 dark:text-amber-500 shrink-0" />
          <div className="min-w-0">
            <span className="block text-xs uppercase tracking-wider font-semibold font-sans text-stone-800 dark:text-stone-200 truncate">
              {translate("Kütüphanem")}</span>
            <span className="block text-[9px] font-mono text-stone-400 dark:text-stone-500 truncate" title={translate("Proje klasöründeki solutions dizini")}>
              {translate("Yerel JSON · solutions/")}</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800 shrink-0">
            {items.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNewQuestion}
            className="p-1 hover:bg-[#eae2d2] dark:hover:bg-stone-800 text-[#78716c] dark:text-stone-400 hover:text-[#1c1917] dark:hover:text-stone-100 rounded transition-colors cursor-pointer"
            title={translate("Yeni Soru Gönder")}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[#eae2d2] dark:hover:bg-stone-800 text-[#78716c] dark:text-stone-400 hover:text-[#1c1917] dark:hover:text-stone-100 rounded transition-colors cursor-pointer"
            title={translate("Kütüphane Panelini Kapat")}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Arama ve Filtre Çubuğu */}
      <div className="p-3 border-b border-[#e4dcce] dark:border-stone-800 space-y-2.5 bg-[#f6f1e5]/50 dark:bg-canvas shrink-0">
        {/* Arama Girişi */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={translate("Başlık, konu veya anahtar kelime...")}
            className="w-full pl-8 pr-7 py-1.5 text-xs font-sans rounded bg-[#fdfcf9] dark:bg-panel border border-[#d8cfbe] dark:border-stone-700 text-[#292524] dark:text-stone-100 placeholder-[#9c9182] dark:placeholder-stone-500 focus:outline-hidden focus:border-amber-600 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bilim Dalı Filtre Sekmeleri */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSelectedDiscipline('all')}
            className={`flex-1 text-[11px] font-sans font-medium py-1 px-2 rounded text-center transition-colors cursor-pointer ${
              selectedDiscipline === 'all'
                ? 'bg-[#eadecc] dark:bg-stone-700 text-[#6b4725] dark:text-stone-100 shadow-2xs font-semibold'
                : 'text-[#78716c] dark:text-stone-400 hover:bg-[#ede5d5] dark:hover:bg-stone-800'
            }`}
          >
            {translate("Tümü")}</button>
          <button
            type="button"
            onClick={() => setSelectedDiscipline('fizik')}
            className={`flex-1 text-[11px] font-sans font-medium py-1 px-2 rounded text-center flex items-center justify-center gap-1 transition-colors cursor-pointer ${
              selectedDiscipline === 'fizik'
                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300/60 dark:border-amber-800 font-semibold'
                : 'text-[#78716c] dark:text-stone-400 hover:bg-[#ede5d5] dark:hover:bg-stone-800'
            }`}
          >
            <Atom className="w-3 h-3 text-amber-700 dark:text-amber-400" />
            <span>{translate("Fizik")}</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedDiscipline('matematik')}
            className={`flex-1 text-[11px] font-sans font-medium py-1 px-2 rounded text-center flex items-center justify-center gap-1 transition-colors cursor-pointer ${
              selectedDiscipline === 'matematik'
                ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-900 dark:text-indigo-200 border border-indigo-300/60 dark:border-indigo-800 font-semibold'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800'
            }`}
          >
            <Binary className="w-3 h-3 text-indigo-700 dark:text-indigo-400" />
            <span>{translate("Matematik")}</span>
          </button>
        </div>
      </div>

      {storageMessage && <p role="status" className={`px-3 py-2 text-[11px] ${storageError ? 'text-red-600' : 'text-stone-500 dark:text-stone-400'}`}>{storageMessage}</p>}
      {pageCount > 1 && <div className="flex items-center justify-between px-3 py-1 text-xs">
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{translate("Önceki")}</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>{translate("Sonraki")}</button>
      </div>}
      {/* Çözüm Kartları Listesi */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4 text-stone-400 dark:text-stone-500 font-serif italic text-xs">
            <BookOpen className="w-8 h-8 mb-2 opacity-40 text-amber-800 dark:text-amber-500" />
            {searchQuery ? (
              <p>{translate("Aramanıza uygun kayıt bulunamadı.")}</p>
            ) : items.length === 0 ? (
              <p>{translate("Henüz kayıtlı bir çözüm yok. Yeni bir soru çözüldüğünde buraya otomatik kaydedilir.")}</p>
            ) : (
              <p>{translate("Bu kategoride henüz çözüm bulunmuyor.")}</p>
            )}
          </div>
        ) : (
          visibleItems.map((item) => {
            const isActive = item.id === activeItemId;
            const isMath = item.discipline === 'matematik';

            return (
              <div
                key={item.id}
                data-spectrum={isMath ? 5 : 3}
                data-active={isActive}
                onClick={() => onSelectItem(item)}
                className={`spectrum-library-card group relative p-3 rounded border text-left cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[#f0e7d6] dark:bg-selected border-[#b59974] dark:border-amber-700/80 shadow-2xs'
                    : 'bg-[#fcfaf4] dark:bg-canvas border-[#e6decb] dark:border-stone-800 hover:border-[#cbbea7] dark:hover:border-stone-700 hover:shadow-2xs'
                }`}
              >
                {/* Aktif İndikatör Çizgisi */}
                {isActive && (
                  <div className="spectrum-library-indicator absolute left-0 top-2 bottom-2 w-1 bg-amber-600 dark:bg-amber-400 rounded-r" />
                )}

                {/* Üst Bilgi Rozetleri: Kategori & Tarih */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className={`spectrum-library-category inline-flex items-center gap-1 text-[10px] font-sans font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                      isMath
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {isMath ? <Binary className="w-2.5 h-2.5" /> : <Atom className="w-2.5 h-2.5" />}
                    <span>{translate(item.category)}</span>
                  </span>

                  <span className="text-[10px] font-sans text-stone-400 dark:text-stone-500 flex items-center gap-1 shrink-0">
                    <Calendar className="w-2.5 h-2.5" />
                    <span>{formatDate(item.createdAt)}</span>
                  </span>
                </div>

                {/* Problem Başlığı */}
                <h4
                  className={`text-xs font-serif font-bold leading-snug line-clamp-2 ${
                    isActive
                      ? 'text-amber-950 dark:text-amber-200'
                      : 'text-stone-900 dark:text-stone-100 group-hover:text-amber-900 dark:group-hover:text-amber-300'
                  }`}
                >
                  {item.title}
                </h4>

                {/* Soru Özeti veya Anahtar Kelimeler */}
                <p className="text-[11px] font-serif text-stone-500 dark:text-stone-400 line-clamp-1 mt-1 italic">
                  {item.problemText || translate("Problem çözümü")}
                </p>

                {/* Alt Künye: Katman Sayısı, Model & Silme */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-stone-100 dark:border-stone-800/80 text-[10px] text-stone-400 dark:text-stone-500 font-sans">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5">
                      <Layers className="w-3 h-3 text-stone-400" />
                      <span>{item.layerCount || 0}  {translate("katman")}</span>
                    </span>
                    {item.metadata?.modelName && (
                      <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                        {item.metadata.modelName.replace('gemini-', '').replace('gpt-', '')}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(translate("\"{0}\" kaydını silmek istediğinize emin misiniz?", [item.title]))) {
                        onDeleteItem(item.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 p-1 rounded transition-opacity cursor-pointer"
                    title={translate("Bu Çözümü Kütüphaneden Sil")}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Yeniden Boyutlandırma Tutamacı (Sağ Kenar) */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setPanelWidth(320);
          try {
            localStorage.setItem('katmandu_library_width', '320');
          } catch {}
        }}
        title={translate("Sağa/sola sürükleyerek genişliği ayarlayın (Sıfırlamak için çift tıklayın)")}
        className={`workspace-resize-handle absolute top-0 bottom-0 -right-1 w-2.5 cursor-col-resize z-30 group flex items-center justify-center transition-colors select-none ${
          isResizing ? 'bg-amber-600/30' : 'hover:bg-amber-500/20'
        }`}
      >
        <div
          className={`w-0.5 h-8 rounded-full transition-colors ${
            isResizing
              ? 'bg-amber-600 dark:bg-amber-400'
              : 'bg-stone-300 dark:bg-stone-700 group-hover:bg-amber-500 dark:group-hover:bg-amber-400'
          }`}
        />
      </div>
    </aside>
  );
};
