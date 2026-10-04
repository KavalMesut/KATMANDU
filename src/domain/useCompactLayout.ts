import { useEffect, useState } from 'react';

export const COMPACT_LAYOUT_QUERY = '(max-width: 1199px)';

export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && Boolean(window.matchMedia?.(COMPACT_LAYOUT_QUERY).matches)
  );
  useEffect(() => {
    const media = window.matchMedia?.(COMPACT_LAYOUT_QUERY);
    if (!media) return;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
