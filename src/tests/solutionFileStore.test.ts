import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolutionFileStore } from '../../server/solutionFileStore';

const temporaryDirectories: string[] = [];

async function createStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'katmandu-solutions-'));
  temporaryDirectories.push(directory);
  return { directory, store: new SolutionFileStore(directory) };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SolutionFileStore', () => {
  it('her çözümü biçimlendirilmiş ayrı bir JSON dosyasına kaydeder ve günceller', async () => {
    const { directory, store } = await createStore();
    await store.save({ id: 'sol_123', createdAt: 10, title: 'Basit Sarkaç' });

    const raw = await readFile(path.join(directory, 'sol_123.json'), 'utf8');
    expect(raw).toContain('\n  "title": "Basit Sarkaç"');
    expect(await store.get('sol_123')).toMatchObject({ id: 'sol_123', title: 'Basit Sarkaç' });

    await store.save({ id: 'sol_123', createdAt: 10, title: 'Güncel Başlık' });
    expect(await store.list()).toEqual([
      expect.objectContaining({ id: 'sol_123', title: 'Güncel Başlık' })
    ]);
  });

  it('soruya ait kullanım raporunu aynı JSON dosyasında saklar', async () => {
    const { directory, store } = await createStore();
    const report = { durationMs: 2300, runs: [
      { role: 'router', modelName: 'gpt-6-sol', usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 } },
      { role: 'solution', modelName: 'gemini-3.6-flash', usage: { inputTokens: 40, outputTokens: 60, totalTokens: 100 } }
    ], totalUsage: { inputTokens: 52, outputTokens: 63, totalTokens: 115 } };
    await store.save({ id: 'sol_report', createdAt: 10, document: { executionReport: report } });
    expect(JSON.parse(await readFile(path.join(directory, 'sol_report.json'), 'utf8')).document.executionReport).toEqual(report);
    expect(((await store.get('sol_report'))?.document as { executionReport?: unknown })?.executionReport).toEqual(report);
  });

  it('bozuk JSON dosyasını atlayıp sağlam kayıtları okumaya devam eder', async () => {
    const { directory, store } = await createStore();
    await store.save({ id: 'sol_ok', createdAt: 20 });
    await writeFile(path.join(directory, 'bozuk.json'), '{', 'utf8');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await store.list()).toEqual([expect.objectContaining({ id: 'sol_ok' })]);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('bozuk.json'), expect.anything());
    warning.mockRestore();
  });

  it('dizin dışına çıkabilecek kimlikleri reddeder ve yalnızca JSON kayıtlarını temizler', async () => {
    const { directory, store } = await createStore();
    await expect(store.save({ id: '../unsafe' })).rejects.toThrow('Geçersiz çözüm');
    await store.save({ id: 'sol_safe' });
    await writeFile(path.join(directory, 'README.md'), 'koru', 'utf8');

    await store.clear();

    expect(await store.list()).toEqual([]);
    expect(await readFile(path.join(directory, 'README.md'), 'utf8')).toBe('koru');
  });
});
