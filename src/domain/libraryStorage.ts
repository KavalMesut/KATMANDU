import { containsConcept } from '../i18n/concepts';
import { translate, getLanguage, subscribeLanguage } from '../i18n';
import { summarizeLibraryItem, type LibrarySummary } from './librarySummary';
import { LibraryItem, SolutionDocument, ExpansionLayer, SolutionMetadata } from './types';

const DB_NAME = 'katmandu_library_db';
const DB_VERSION = 2;
const STORE_NAME = 'solutions';
const SUMMARY_STORE = 'summaries';

// In-memory yedek hafıza (Node.js/Vitest veya IndexedDB erişimi kısıtlı ortamlar için)
let inMemoryFallback: LibraryItem[] = [];

/**
 * IndexedDB bağlantısını açar veya fail-soft geri döner.
 */
function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('discipline', 'discipline', { unique: false });
        }
        if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
          const summaries = db.createObjectStore(SUMMARY_STORE, { keyPath: 'id' });
          const cursor = request.transaction!.objectStore(STORE_NAME).openCursor();
          cursor.onsuccess = () => {
            if (!cursor.result) return;
            summaries.put(summarizeLibraryItem(cursor.result.value));
            cursor.result.continue();
          };
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn('IndexedDB açılamadı, yerel hafıza yedeği kullanılacak.');
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB başlatma hatası:', err);
      resolve(null);
    }
  });
}

/**
 * LocalStorage yedek okuma/yazma
 */
const LOCAL_STORAGE_KEY = 'katmandu_library_backup';
const LIBRARY_API = '/api/library';

let diskError: string | null = null;
type DiskResult<T> = { available: true; value: T } | { available: false };

async function requestDisk<T>(path = '', init?: RequestInit): Promise<DiskResult<T>> {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return { available: false };
  }
  try {
    const response = await window.fetch(`${LIBRARY_API}${path}`, {
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), 'X-Katmandu-Request': 'library-ui', 'X-Katmandu-Language': getLanguage(), ...init?.headers },
      signal: AbortSignal.timeout(10000)
    });
    diskError = null;
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      if (response.status >= 400 && response.status !== 404) {
        const detail = await response.json().catch(() => null);
        diskError = `Diske kaydedilemedi: ${detail?.error || `HTTP ${response.status}`}`;
      }
      return { available: false };
    }
    return { available: true, value: await response.json() as T };
  } catch {
    diskError = null;
    return { available: false };
  }
}

async function readAllFromDisk(): Promise<DiskResult<LibraryItem[]>> {
  const result = await requestDisk<{ items: LibraryItem[] }>();
  return result.available
    ? { available: true, value: Array.isArray(result.value.items) ? result.value.items : [] }
    : result;
}

async function readItemFromDisk(id: string): Promise<DiskResult<LibraryItem | null>> {
  const result = await requestDisk<{ item: LibraryItem | null }>(`/${encodeURIComponent(id)}`);
  return result.available ? { available: true, value: result.value.item || null } : result;
}

async function saveItemToDisk(item: LibraryItem): Promise<boolean> {
  const result = await requestDisk<{ ok: boolean }>(`/${encodeURIComponent(item.id)}`, {
    method: 'PUT',
    body: JSON.stringify(item)
  });
  return result.available && result.value.ok === true;
}

async function deleteItemFromDisk(id: string): Promise<boolean> {
  const result = await requestDisk<{ ok: boolean }>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return result.available && result.value.ok === true;
}

async function clearDisk(): Promise<boolean> {
  const result = await requestDisk<{ ok: boolean }>('', { method: 'DELETE' });
  return result.available && result.value.ok === true;
}

function readFromLocalStorage(): LibraryItem[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return inMemoryFallback;
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return inMemoryFallback;
    return JSON.parse(raw);
  } catch {
    return inMemoryFallback;
  }
}

function writeToLocalStorage(items: LibraryItem[], required = false) {
  inMemoryFallback = items;
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    if (required) throw new Error(translate("Çözüm kalıcı olarak kaydedilemedi: tarayıcı depolaması dolu veya erişilemiyor."));
    console.warn('LocalStorage yedeği yazılamadı:', err);
  }
}

function newestItems<T extends { id: string; updatedAt?: number }>(primary: T[], backup: T[]): T[] {
  const items = new Map(primary.map(item => [item.id, item]));
  for (const item of backup) {
    const old = items.get(item.id);
    if (!old || (item.updatedAt || 0) > (old.updatedAt || 0)) items.set(item.id, item);
  }
  return [...items.values()];
}

async function getAllBrowserItems(): Promise<LibraryItem[]> {
  const db = await openDatabase();
  if (!db) return readFromLocalStorage().sort((a, b) => b.createdAt - a.createdAt);
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(newestItems<LibraryItem>(request.result || [], readFromLocalStorage()).sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => resolve(readFromLocalStorage());
    } catch {
      resolve(readFromLocalStorage());
    }
  });
}

async function getBrowserItem(id: string): Promise<LibraryItem | null> {
  const db = await openDatabase();
  if (!db) return readFromLocalStorage().find((item) => item.id === id) || null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(newestItems<LibraryItem>(request.result ? [request.result] : [], readFromLocalStorage().filter(item => item.id === id))[0] || null);
      request.onerror = () => resolve(readFromLocalStorage().find((item) => item.id === id) || null);
    } catch {
      resolve(readFromLocalStorage().find((item) => item.id === id) || null);
    }
  });
}

async function saveBrowserItem(item: LibraryItem): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    const items = readFromLocalStorage().filter((current) => current.id !== item.id);
    writeToLocalStorage([item, ...items], true);
    return;
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_NAME, SUMMARY_STORE], 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      tx.objectStore(SUMMARY_STORE).put(summarizeLibraryItem(item));
      tx.oncomplete = () => {
        const backup = readFromLocalStorage().filter((current) => current.id !== item.id);
        writeToLocalStorage([item, ...backup].slice(0, 10));
        resolve();
      };
      tx.onerror = () => {
        try {
          const items = readFromLocalStorage().filter((current) => current.id !== item.id);
          writeToLocalStorage([item, ...items], true);
          resolve();
        } catch (error) { reject(error); }
      };
    } catch {
      try {
        const items = readFromLocalStorage().filter((current) => current.id !== item.id);
        writeToLocalStorage([item, ...items], true);
        resolve();
      } catch (error) { reject(error); }
    }
  });
}

async function deleteBrowserItem(id: string): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    writeToLocalStorage(readFromLocalStorage().filter((item) => item.id !== id));
    return;
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_NAME, SUMMARY_STORE], 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.objectStore(SUMMARY_STORE).delete(id);
      const finish = () => {
        writeToLocalStorage(readFromLocalStorage().filter((item) => item.id !== id));
        resolve();
      };
      tx.oncomplete = finish;
      tx.onerror = () => reject(new Error(translate("Tarayıcı arşivinden silinemedi; işlem yeniden denenecek.")));
    } catch { reject(new Error(translate("Tarayıcı arşivinden silinemedi; işlem yeniden denenecek."))); }
  });
}

async function clearBrowserItems(): Promise<void> {
  const db = await openDatabase();
  inMemoryFallback = [];
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(LOCAL_STORAGE_KEY); }
    catch { throw new Error(translate("Tarayıcı arşiv yedeği temizlenemedi; işlem yeniden denenecek.")); }
  }
  if (!db) return;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_NAME, SUMMARY_STORE], 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.objectStore(SUMMARY_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(translate("Tarayıcı arşivi temizlenemedi; işlem yeniden denenecek.")));
    } catch { reject(new Error(translate("Tarayıcı arşivi temizlenemedi; işlem yeniden denenecek."))); }
  });
}

/**
 * Problem başlığından ve metninden bilim dalı, kategori ve etiketleri otomatik çıkarır.
 */
export function deriveDisciplineAndCategory(
  title: string,
  problemText: string
): { discipline: 'fizik' | 'matematik'; category: string; tags: string[] } {
  const combined = `${title || ''} ${problemText || ''}`.toLowerCase();

  const mathKeywords = [
    { tag: 'kalkülüs', terms: ['türev', 'integral', 'limit', 'seri', 'taylor', 'diferansiyel'] },
    { tag: translate("lineer cebir"), terms: ['matris', 'özdeğer', 'özvektör', 'vektör uzayı', 'determinant', 'rank'] },
    { tag: 'geometri', terms: ['üçgen', 'pisagor', 'hipotenüs', 'açı', 'teğet', 'çember', 'öklid'] },
    { tag: translate("soyut cebir"), terms: ['grup', 'halka', 'cisim', 'izomorfizm', 'modüler'] },
    { tag: 'olasılık', terms: ['olasılık', 'varyans', 'dağılım', 'beklenen değer', 'rastgele'] }
  ];

  const physicsKeywords = [
    { tag: translate("lagrange mekaniği"), terms: ['lagrange', 'euler-lagrange', 'genelleştirilmiş koordinat', 'serbestlik derecesi'] },
    { tag: translate("küçük salınımlar"), terms: ['yay', 'salınım', 'frekans', 'periyot', 'basit harmonik', 'kama'] },
    { tag: translate("newton dinamigi"), terms: ['newton', 'kuvvet', 'eylemsizlik', 'dönme', 'tork', 'momentum', 'sürtünme'] },
    { tag: translate("elektrodinamik"), terms: ['manyetik', 'elektrik', 'yük', 'indüksiyon', 'maxwell', 'potansiyel'] },
    { tag: 'termodinamik', terms: ['ısı', 'entropi', 'termodinamik', 'basınç', 'gaz', 'sıcaklık'] }
  ];

  let mathScore = 0;
  let physicsScore = 0;
  const detectedTags = new Set<string>();

  for (const group of mathKeywords) {
    for (const term of group.terms) {
      if (containsConcept(combined, term)) {
        mathScore += 1;
        detectedTags.add(translate(group.tag));
      }
    }
  }

  for (const group of physicsKeywords) {
    for (const term of group.terms) {
      if (containsConcept(combined, term)) {
        physicsScore += 1;
        detectedTags.add(translate(group.tag));
      }
    }
  }

  const tags = Array.from(detectedTags);

  if (mathScore > physicsScore) {
    let category = translate("Genel Matematik");
    if (containsConcept(combined, 'türev') || combined.includes('integral') || containsConcept(combined, 'diferansiyel')) {
      category = translate("Kalkülüs & Analiz");
    } else if (containsConcept(combined, 'matris') || containsConcept(combined, 'özdeğer') || containsConcept(combined, 'vektör')) {
      category = translate("Lineer Cebir");
    } else if (containsConcept(combined, 'geometri') || containsConcept(combined, 'pisagor') || containsConcept(combined, 'üçgen')) {
      category = translate("Geometri & Trigonometri");
    }
    return {
      discipline: 'matematik',
      category,
      tags: tags.length > 0 ? tags : [translate('matematik')]
    };
  }

  // Varsayılan fizik
  let category = translate("Klasik Mekanik");
  if (combined.includes('lagrange') || combined.includes('euler-lagrange')) {
    category = translate("Klasik Mekanik / Lagrange");
  } else if (containsConcept(combined, 'yay') || containsConcept(combined, 'salınım') || containsConcept(combined, 'kama')) {
    category = translate("Titreşimler & Salınımlar");
  } else if (containsConcept(combined, 'elektrik') || containsConcept(combined, 'manyetik')) {
    category = translate("Elektromanyetizma");
  } else if (containsConcept(combined, 'tork') || containsConcept(combined, 'dönme') || containsConcept(combined, 'açısal')) {
    category = translate("Rijit Cisim Dinamiği");
  }

  return {
    discipline: 'fizik',
    category,
    tags: tags.length > 0 ? tags : [translate('fizik'), translate('mekanik')]
  };
}

export interface ArchiveStatus { state: 'disk' | 'pending' | 'error'; pending: number; message: string }
let storageStatus: ArchiveStatus = { state: 'pending', pending: 0, message: translate("Arşiv kontrol ediliyor…") };
const listeners = new Set<() => void>();
subscribeLanguage(() => {
  const previous = storageStatus;
  const message = previous.state === 'disk' ? translate("Diske kaydedildi")
    : previous.pending > 0 ? translate("Tarayıcıda saklanıyor · {0} işlem diske kaydetmeyi bekliyor", [previous.pending])
    : translate(previous.message);
  storageStatus = { ...previous, message };
  listeners.forEach(listener => listener());
});
const JOURNAL_KEY = 'katmandu_library_sync_v1';
type Journal = { clear: boolean; operations: Record<string, 'save' | 'delete'> };
let memoryJournal: Journal = { clear: false, operations: {} };
let archiveQueue: Promise<unknown> = Promise.resolve();
function serializeArchive<T>(work: () => Promise<T>): Promise<T> {
  const next = archiveQueue.then(work).catch(error => {
    storageStatus = { state: 'error', pending: Object.keys(readJournal().operations).length,
      message: error instanceof Error ? error.message : translate("Arşiv işlemi başarısız.") };
    listeners.forEach(listener => listener());
    throw error;
  });
  archiveQueue = next.catch(() => undefined);
  return next;
}
function readJournal(): Journal {
  if (typeof localStorage === 'undefined') return structuredClone(memoryJournal);
  const raw = localStorage.getItem(JOURNAL_KEY);
  return raw ? JSON.parse(raw) : { clear: false, operations: {} };
}
function writeJournal(journal: Journal): void {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal)); }
    catch { throw new Error(translate("Bekleyen arşiv işlemi saklanamadı. Tarayıcı depolamasını kontrol edin.")); }
  }
  memoryJournal = structuredClone(journal);
}
async function flushPending(): Promise<void> {
  const journal = readJournal();
  let available = true;
  if (journal.clear) {
    const savedAfterClear = await Promise.all(Object.entries(journal.operations).filter(([, op]) => op === 'save').map(([id]) => getBrowserItem(id)));
    await clearBrowserItems();
    for (const item of savedAfterClear) if (item) await saveBrowserItem(item);
    if (await clearDisk()) { journal.clear = false; writeJournal(journal); }
    else available = false;
  }
  if (!journal.clear) {
    for (const [id, operation] of Object.entries(journal.operations)) {
      if (operation === 'delete') await deleteBrowserItem(id);
      const item = operation === 'save' ? await getBrowserItem(id) : null;
      const ok = operation === 'delete' ? await deleteItemFromDisk(id) : item ? await saveItemToDisk(item) : false;
      if (!ok) { available = false; break; }
      delete journal.operations[id];
      writeJournal(journal);
    }
  }
  // Check the server even when the journal is empty.
  if (available && !Object.keys(journal.operations).length) available = (await requestDisk('?summary=1')).available;
  const pending = Object.keys(journal.operations).length + Number(journal.clear);
  const next: ArchiveStatus = { state: diskError ? 'error' : available && !pending ? 'disk' : 'pending', pending,
    message: diskError ? translate("{0} · yeniden denenecek", [diskError]) : available && !pending ? translate("Diske kaydedildi") : pending ? translate("Tarayıcıda saklanıyor · {0} işlem diske kaydetmeyi bekliyor", [pending]) : translate("Arşiv tarayıcıda · yerel sunucuya ulaşılamıyor") };
  if (next.state !== storageStatus.state || next.pending !== storageStatus.pending || next.message !== storageStatus.message) {
    storageStatus = next;
    listeners.forEach(listener => listener());
  }
}
function mergeArchive<T extends { id: string; createdAt: number; updatedAt?: number }>(disk: T[], browser: T[]): T[] {
  const journal = readJournal();
  const merged = new Map(disk.filter(() => !journal.clear).map(item => [item.id, item]));
  for (const item of browser) {
    const old = merged.get(item.id);
    if (!old || journal.operations[item.id] === 'save' || (item.updatedAt || 0) > (old.updatedAt || 0)) merged.set(item.id, item);
  }
  for (const [id, operation] of Object.entries(journal.operations)) if (operation === 'delete') merged.delete(id);
  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}
async function readBrowserSummaries(): Promise<LibrarySummary[]> {
  const db = await openDatabase();
  if (!db) return readFromLocalStorage().map(summarizeLibraryItem);
  return new Promise(resolve => {
    const tx = db.transaction(SUMMARY_STORE, 'readonly');
    const request = tx.objectStore(SUMMARY_STORE).getAll();
    request.onsuccess = () => resolve(newestItems<LibrarySummary>(request.result || [], readFromLocalStorage().map(summarizeLibraryItem)));
    request.onerror = () => resolve(readFromLocalStorage().map(summarizeLibraryItem));
    tx.oncomplete = () => db.close();
  });
}

/**
 * KATMANDU Kalıcı Kütüphane Yöneticisi (LibraryStorage)
 */
export class LibraryStorage {
  /**
   * Tüm kayıtlı çözümleri en yeniden en eskiye sıralı olarak döner.
   */
  public static getAllItems(): Promise<LibraryItem[]> {
    return serializeArchive(async () => {
      await flushPending();
      const [disk, browser] = await Promise.all([readAllFromDisk(), getAllBrowserItems()]);
      return mergeArchive(disk.available ? disk.value : [], browser);
    });
  }

  /** Listing does not download documents, attachments or expansion trees. */
  public static getSummaries(): Promise<LibrarySummary[]> {
    return serializeArchive(async () => {
      await flushPending();
      const [disk, browser] = await Promise.all([
        requestDisk<{ items: LibrarySummary[] }>('?summary=1'), readBrowserSummaries()
      ]);
      if (disk.available) {
        const journal = readJournal();
        const diskIds = new Set(disk.value.items.map(item => item.id));
        if (!journal.clear) {
          for (const item of browser) if (!diskIds.has(item.id) && !journal.operations[item.id]) journal.operations[item.id] = 'save';
          writeJournal(journal);
          await flushPending();
        }
      }
      return mergeArchive(disk.available ? disk.value.items : [], browser);
    });
  }

  public static getItem(id: string): Promise<LibraryItem | null> {
    return serializeArchive(async () => {
      const journal = readJournal();
      if (journal.operations[id] === 'delete' || (journal.clear && journal.operations[id] !== 'save')) return null;
      const local = await getBrowserItem(id);
      if (journal.operations[id] === 'save') return local;
      const disk = await readItemFromDisk(id);
      if (!disk.available) return local;
      const item = !disk.value || (local?.updatedAt || 0) > (disk.value.updatedAt || 0) ? local : disk.value;
      if (item) await saveBrowserItem(item);
      return item;
    });
  }

  public static saveItem(item: LibraryItem): Promise<void> {
    return serializeArchive(async () => {
      const previous = await getBrowserItem(item.id);
      const updated = { ...item, schemaVersion: 1,
        updatedAt: Math.max(Date.now(), (item.updatedAt || 0) + 1, (previous?.updatedAt || 0) + 1) };
      await saveBrowserItem(updated);
      const journal = readJournal();
      journal.operations[item.id] = 'save';
      writeJournal(journal);
      await flushPending();
    });
  }

  public static async updateLayers(id: string, layers: ExpansionLayer[]): Promise<LibraryItem | null> {
    const item = await this.getItem(id);
    if (!item) return null;
    const updated = { ...item, layers };
    await this.saveItem(updated);
    return updated;
  }

  public static deleteItem(id: string): Promise<void> {
    return serializeArchive(async () => {
      const journal = readJournal();
      journal.operations[id] = 'delete';
      writeJournal(journal);
      await deleteBrowserItem(id);
      await flushPending();
    });
  }

  public static clearAll(): Promise<void> {
    return serializeArchive(async () => {
      writeJournal({ clear: true, operations: {} });
      await clearBrowserItems();
      await flushPending();
    });
  }

  public static getStorageStatus(): ArchiveStatus { return storageStatus; }
  public static subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  /**
   * Mevcut aktif bir SolutionDocument'ı kütüphane formatına dönüştürür.
   */
  public static createLibraryItemFromDocument(
    document: SolutionDocument,
    layers: ExpansionLayer[] = [],
    metadata?: SolutionMetadata
  ): LibraryItem {
    const classification = deriveDisciplineAndCategory(document.problemTitle, document.problemText);

    return {
      id: document.id || `item_${Date.now()}`,
      title: document.problemTitle || translate("İsimsiz Çözüm"),
      problemText: document.problemText || '',
      discipline: classification.discipline,
      category: classification.category,
      tags: classification.tags,
      createdAt: metadata?.solvedAt || document.metadata?.solvedAt || Date.now(),
      document,
      layers,
      metadata: metadata || document.metadata
    };
  }
}
