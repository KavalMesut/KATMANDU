import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SolutionFileStore } from '../../server/solutionFileStore';

let root: string, legacy: string, destination: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'katmandu-archive-migration-'));
  legacy = path.join(root, 'cozumler'); destination = path.join(root, 'solutions');
});
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

describe('legacy solution directory migration', () => {
  it('moves exact file contents and saved provenance while concurrent operations use the new directory', async () => {
    await mkdir(legacy);
    const raw = '{"id":"saved","title":"Sarkaç","createdAt":42,"metadata":{"providerName":"Historical model","language":"tr"}}\n';
    await writeFile(path.join(legacy, 'saved.json'), raw);
    // New releases already include the archive documentation in solutions/.
    await mkdir(destination); await writeFile(path.join(destination, 'README.md'), 'Documentation');
    const store = new SolutionFileStore(destination, legacy);
    const [items, saved] = await Promise.all([store.list(), store.get('saved'), store.save({ id: 'new' })]);
    expect(items).toContainEqual(JSON.parse(raw));
    expect(saved).toEqual(JSON.parse(raw));
    expect(await readFile(path.join(destination, 'saved.json'), 'utf8')).toBe(raw);
    expect(await readFile(path.join(destination, 'README.md'), 'utf8')).toBe('Documentation');
    await expect(lstat(legacy)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await store.get('new')).toEqual({ id: 'new' });
  });

  it('starts a fresh archive when the legacy directory is absent', async () => {
    const store = new SolutionFileStore(destination, legacy);
    expect(await store.list()).toEqual([]);
    await store.save({ id: 'new' });
    expect(await readFile(path.join(destination, 'new.json'), 'utf8')).toContain('"new"');
    await expect(lstat(legacy)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves different conflicting files as backups without overwriting or rewriting IDs', async () => {
    await mkdir(legacy); await mkdir(destination);
    const old = '{"id":"same","createdAt":1,"title":"Old text"}\n';
    const current = '{"id":"same","createdAt":2,"title":"Current text"}\n';
    await writeFile(path.join(legacy, 'same.json'), old);
    await writeFile(path.join(destination, 'same.json'), current);
    await writeFile(path.join(legacy, 'identical.json'), '{"id":"identical"}');
    await writeFile(path.join(destination, 'identical.json'), '{"id":"identical"}');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new SolutionFileStore(destination, legacy);
    expect(await store.list()).toHaveLength(2);
    expect(await readFile(path.join(destination, 'same.json'), 'utf8')).toBe(current);
    const backups = await readdir(path.join(destination, 'legacy-cozumler'));
    expect(backups).toHaveLength(1);
    expect(await readFile(path.join(destination, 'legacy-cozumler', backups[0]), 'utf8')).toBe(old);
    expect(warning).toHaveBeenCalledTimes(1);
    await store.delete('same');
    expect(await new SolutionFileStore(destination, legacy).get('same')).toBeNull();
    await store.clear();
    expect(await new SolutionFileStore(destination, legacy).list()).toEqual([]);
    expect(await readFile(path.join(destination, 'legacy-cozumler', backups[0]), 'utf8')).toBe(old);
  });

  it('keeps unreadable JSON and unrelated legacy files without silently discarding them', async () => {
    await mkdir(legacy);
    await writeFile(path.join(legacy, 'broken.json'), '{');
    await writeFile(path.join(legacy, 'notes.txt'), 'Private notes');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await new SolutionFileStore(destination, legacy).list()).toEqual([]);
    expect(await readFile(path.join(destination, 'broken.json'), 'utf8')).toBe('{');
    expect(await readFile(path.join(legacy, 'notes.txt'), 'utf8')).toBe('Private notes');
  });

  it('keeps the source on failure and retries after the destination is repaired', async () => {
    await mkdir(legacy); await mkdir(destination);
    await writeFile(path.join(legacy, 'saved.json'), '{"id":"saved"}');
    await mkdir(path.join(destination, 'saved.json'));
    const store = new SolutionFileStore(destination, legacy);
    await expect(store.get('saved')).rejects.toThrow();
    expect(await readFile(path.join(legacy, 'saved.json'), 'utf8')).toBe('{"id":"saved"}');
    await rm(path.join(destination, 'saved.json'), { recursive: true });
    expect(await store.get('saved')).toEqual({ id: 'saved' });
  });

  it('does not migrate an archive through a directory symlink', async () => {
    const external = path.join(root, 'other'); await mkdir(external);
    await writeFile(path.join(external, 'saved.json'), '{"id":"saved"}');
    await symlink(external, legacy, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new SolutionFileStore(destination, legacy).list()).rejects.toThrow('normal bir klasör');
    expect(await readFile(path.join(external, 'saved.json'), 'utf8')).toBe('{"id":"saved"}');
  });
});
