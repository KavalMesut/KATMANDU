import { translate } from '../i18n';
import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, Sparkles, X, CornerDownLeft } from 'lucide-react';

export interface InquireContext {
  blockId?: string;
  layerId?: string;
  sectionId?: string;
}

interface TextSelectionToolbarProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onInquire: (selectedText: string, customQuery?: string, context?: InquireContext) => void;
}

interface Position {
  x: number;
  y: number;
}

function extractInquiryContext(rangeOrNode?: Range | Node | null): InquireContext {
  if (!rangeOrNode) return {};
  try {
    const node =
      'commonAncestorContainer' in rangeOrNode
        ? rangeOrNode.commonAncestorContainer
        : rangeOrNode;
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : (node.parentElement as HTMLElement | null);
    if (!element) return {};

    const blockEl = element.closest('[data-block-id]') as HTMLElement | null;
    const layerEl = element.closest('[data-layer-id]') as HTMLElement | null;
    const sectionEl = element.closest('[data-section-id]') as HTMLElement | null;

    return {
      blockId: blockEl?.getAttribute('data-block-id') || blockEl?.id,
      layerId: layerEl?.getAttribute('data-layer-id') || layerEl?.id,
      sectionId: sectionEl?.getAttribute('data-section-id') || sectionEl?.id
    };
  } catch {
    return {};
  }
}

/**
 * TextSelectionToolbar:
 * Kullanıcı belgedeki herhangi bir kelimeyi, terimi veya formül parçasını seçtiğinde
 * veya sağ tıkladığında beliren bağlamsal soru sorma araç çubuğu.
 */
export const TextSelectionToolbar: React.FC<TextSelectionToolbarProps> = ({
  containerRef,
  onInquire
}) => {
  const [selectedText, setSelectedText] = useState<string>('');
  const [inquiryContext, setInquiryContext] = useState<InquireContext>({});
  const [position, setPosition] = useState<Position | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState<boolean>(false);
  const [customQuery, setCustomQuery] = useState<string>('');
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Eğer toolbar'ın içine tıklandıysa seçimi sıfırlama
      if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        if (!isPromptOpen) {
          setPosition(null);
          setSelectedText('');
          setInquiryContext({});
        }
        return;
      }

      const text = selection.toString().trim();
      if (text.length > 1 && selection.rangeCount > 0) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          setSelectedText(text);
          const ctx = extractInquiryContext(range);
          setInquiryContext(ctx);
          setPosition({
            x: Math.max(10, rect.left + rect.width / 2),
            y: Math.max(10, rect.top - 10)
          });
        } catch (err) {
          console.warn(translate("Seçim koordinatı alınamadı:"), err);
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container || !container.contains(e.target as Node)) return;

      const selection = window.getSelection();
      let text = selection ? selection.toString().trim() : '';
      let range: Range | null =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

      // Eğer kullanıcı önceden metin seçmeden doğrudan bir kelimeye sağ tıkladıysa:
      // caretRangeFromPoint ile imlecin altındaki kelimeyi (örn: "hipotenüs") otomatik seç
      if (!text && document.caretRangeFromPoint) {
        try {
          const pointRange = document.caretRangeFromPoint(e.clientX, e.clientY);
          if (
            pointRange &&
            pointRange.startContainer &&
            pointRange.startContainer.nodeType === Node.TEXT_NODE
          ) {
            const textNode = pointRange.startContainer as Text;
            const content = textNode.textContent || '';
            const offset = pointRange.startOffset;

            // Kelime sınırlarını belirle (harf, rakam, alt çizgi, tire, Türkçe harfler)
            const isWordChar = (c: string) => /[\p{L}\p{N}_\\-]/u.test(c);
            let start = offset;
            while (start > 0 && isWordChar(content[start - 1])) {
              start--;
            }
            let end = offset;
            while (end < content.length && isWordChar(content[end])) {
              end++;
            }

            const word = content.slice(start, end).trim();
            if (word.length > 0) {
              const newRange = document.createRange();
              newRange.setStart(textNode, start);
              newRange.setEnd(textNode, end);
              selection?.removeAllRanges();
              selection?.addRange(newRange);
              text = word;
              range = newRange;
            }
          }
        } catch (err) {
          console.warn(translate("caretRangeFromPoint hatası:"), err);
        }
      }

      if (text.length > 0) {
        e.preventDefault();
        setSelectedText(text);
        const ctx = extractInquiryContext(range || (e.target as Node));
        setInquiryContext(ctx);
        setPosition({
          x: e.clientX,
          y: e.clientY
        });
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [containerRef, isPromptOpen]);

  const handleQuickInquire = () => {
    if (selectedText) {
      onInquire(selectedText, undefined, inquiryContext);
      handleClose();
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedText) {
      onInquire(selectedText, customQuery.trim() || undefined, inquiryContext);
      handleClose();
    }
  };

  const handleClose = () => {
    setPosition(null);
    setSelectedText('');
    setInquiryContext({});
    setIsPromptOpen(false);
    setCustomQuery('');
    window.getSelection()?.removeAllRanges();
  };

  if (!position || !selectedText) return null;

  return (
    <div
      ref={toolbarRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)'
      }}
      className="fixed z-50 animate-in fade-in zoom-in-95 duration-150"
    >
      {!isPromptOpen ? (
        <div className="flex items-center gap-1.5 bg-stone-900 text-stone-100 rounded-md shadow-lg px-2.5 py-1.5 border border-stone-700 text-xs select-none">
          <button
            type="button"
            onClick={handleQuickInquire}
            className="flex items-center gap-1.5 hover:text-amber-300 transition-colors font-sans font-medium pr-2 border-r border-stone-700"
            title={translate("Seçili ifadeyi mevcut bağlamda açıkla")}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{translate("Bu İfadeyi Açıkla")}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPromptOpen(true)}
            className="flex items-center gap-1 hover:text-amber-300 transition-colors font-sans px-1"
            title={translate("Seçili ifade hakkında özel bir soru sor")}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{translate("Soru Sor")}</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="text-stone-400 hover:text-stone-200 pl-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleCustomSubmit}
          className="bg-white rounded-md shadow-xl border border-stone-300 p-3 w-80 text-stone-900 text-xs font-sans"
        >
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-stone-200">
            <span className="font-semibold text-stone-700 truncate max-w-[200px]" title={selectedText}>
              "{selectedText}"
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="text-stone-400 hover:text-stone-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder={translate("Örn: Bu terim neden eksi işaretli? / Nereden geldi?")}
            autoFocus
            className="w-full p-2 border border-stone-300 rounded font-serif text-xs outline-hidden focus:border-amber-700"
          />

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPromptOpen(false)}
              className="px-2 py-1 text-stone-500 hover:text-stone-800"
            >
              {translate("Geri")}</button>
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded font-medium shadow-2xs"
            >
              <span>{translate("Sor")}</span>
              <CornerDownLeft className="w-3 h-3" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
