import { useEffect, useState } from 'react';
import { LibraryStorage } from './libraryStorage';
import type { LibrarySummary } from './librarySummary';

/** Archive list, sync status and reconnection are independent of solution rendering. */
export function useLibraryArchive() {
  const [items, setItems] = useState<LibrarySummary[]>([]);
  const [status, setStatus] = useState(LibraryStorage.getStorageStatus);
  useEffect(() => {
    let mounted = true;
    const refresh = () => { void LibraryStorage.getSummaries().then(value => {
      if (mounted) setItems(value);
    }).catch(() => { if (mounted) setStatus(LibraryStorage.getStorageStatus()); }); };
    const unsubscribe = LibraryStorage.subscribe(() => { if (mounted) setStatus(LibraryStorage.getStorageStatus()); });
    refresh();
    window.addEventListener('online', refresh);
    const timer = window.setInterval(() => {
      if (LibraryStorage.getStorageStatus().state !== 'disk') refresh();
    }, 30000);
    return () => { mounted = false; unsubscribe(); clearInterval(timer); window.removeEventListener('online', refresh); };
  }, []);
  return { items, setItems, status };
}
