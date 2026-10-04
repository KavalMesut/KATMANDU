// @vitest-environment jsdom
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryStorage } from '../domain/libraryStorage';
import { summarizeLibraryItem } from '../domain/librarySummary';
import type { LibraryItem } from '../domain/types';
let online: boolean;
let disk: Map<string, LibraryItem>;
let requests: string[];
const item = (title = 'Eski'): LibraryItem => ({ id: 'sync_1', title, problemText: 'soru', discipline: 'fizik', category: 'mekanik', tags: [], createdAt: 1,
  document: { id: 'sync_1', problemId: 'p1', problemTitle: title, problemText: 'soru', strategy: '', assumptions: [], sections: [], totalEquations: 0 }, layers: [] });
beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
  online = true; disk = new Map(); requests = [];
  window.fetch = vi.fn(async (input, init) => {
    requests.push(String(input));
    if (!online) throw new Error('offline');
    const url = new URL(String(input), 'http://localhost');
    const id = url.pathname.split('/')[3];
    if (init?.method === 'PUT') disk.set(id, JSON.parse(String(init.body)));
    if (init?.method === 'DELETE') { if (id) disk.delete(id); else disk.clear(); }
    return new Response(JSON.stringify(init?.method ? { ok: true } : id ? { item: disk.get(id) || null }
      : { items: [...disk.values()].map(value => url.searchParams.has('summary') ? summarizeLibraryItem(value) : value) }), { headers: { 'Content-Type': 'application/json' } });
  });
  await LibraryStorage.clearAll();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('archive reconnection', () => {
  it('replays an offline update rather than replacing it with stale disk data', async () => {
    await LibraryStorage.saveItem(item());
    online = false;
    await LibraryStorage.saveItem(item('Yeni'));
    expect(LibraryStorage.getStorageStatus().pending).toBe(1);
    expect((await LibraryStorage.getItem('sync_1'))?.title).toBe('Yeni');
    online = true;
    expect((await LibraryStorage.getAllItems())[0].title).toBe('Yeni');
    expect(disk.get('sync_1')?.title).toBe('Yeni');
    expect(LibraryStorage.getStorageStatus().state).toBe('disk');
  });
  it('retains delete tombstones and never resurrects an offline deletion', async () => {
    await LibraryStorage.saveItem(item()); online = false;
    await LibraryStorage.deleteItem('sync_1');
    expect(await LibraryStorage.getItem('sync_1')).toBeNull();
    expect(await LibraryStorage.getAllItems()).toEqual([]);
    online = true;
    expect(await LibraryStorage.getSummaries()).toEqual([]);
    expect(disk.size).toBe(0);
  });
  it('replays clear before saving a new item created while offline', async () => {
    await LibraryStorage.saveItem(item()); online = false;
    await LibraryStorage.clearAll();
    await LibraryStorage.saveItem({ ...item('Sonraki'), id: 'new' }); online = true;
    expect((await LibraryStorage.getAllItems()).map(value => value.id)).toEqual(['new']);
    expect([...disk.keys()]).toEqual(['new']);
  });
  it('keeps pending operations across a module reload', async () => {
    await LibraryStorage.saveItem(item()); online = false;
    await LibraryStorage.deleteItem('sync_1');
    vi.resetModules();
    const reloaded = (await import('../domain/libraryStorage')).LibraryStorage;
    online = true;
    expect(await reloaded.getSummaries()).toEqual([]);
    expect(disk.size).toBe(0);
  });
  it('lists lightweight summaries and fetches a document only when opened', async () => {
    await LibraryStorage.saveItem(item()); requests = [];
    const summaries = await LibraryStorage.getSummaries();
    expect(summaries[0]).not.toHaveProperty('document');
    expect(summaries[0]).not.toHaveProperty('layers');
    expect(requests.every(url => url.includes('summary=1'))).toBe(true);
    await LibraryStorage.getItem('sync_1');
    expect(requests).toContain('/api/library/sync_1');
  });
  it('uses the durable backup when an IndexedDB update fails instead of uploading the old version', async () => {
    await LibraryStorage.saveItem(item());
    online = false;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new Error('IndexedDB write failed'); });
    await LibraryStorage.saveItem(item('Yedekteki güncelleme'));
    expect((await LibraryStorage.getItem('sync_1'))?.title).toBe('Yedekteki güncelleme');
    online = true;
    expect((await LibraryStorage.getSummaries())[0].title).toBe('Yedekteki güncelleme');
    expect(disk.get('sync_1')?.title).toBe('Yedekteki güncelleme');
  });
  it('reports a persistence error when neither IndexedDB nor the backup can be written', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(LibraryStorage.saveItem(item())).rejects.toThrow('kalıcı olarak kaydedilemedi');
    expect(LibraryStorage.getStorageStatus().state).toBe('error');
    expect(disk.size).toBe(0);
  });
  it('keeps a failed disk write queued instead of declaring it saved', async () => {
    window.fetch = vi.fn(async () => new Response('{"error":"disk full"}', { status: 500, headers: { 'Content-Type': 'application/json' } }));
    await LibraryStorage.saveItem(item('Korunacak'));
    expect(LibraryStorage.getStorageStatus().state).toBe('error');
    expect((await LibraryStorage.getItem('sync_1'))?.title).toBe('Korunacak');
  });
});
