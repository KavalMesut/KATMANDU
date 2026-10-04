import { translate } from '../src/i18n';
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { summarizeLibraryItem, type LibrarySummary } from '../src/domain/librarySummary';
import type { LibraryItem } from '../src/domain/types';
import { migrateSolutionDirectory } from './migrateSolutionDirectory';

export interface StoredSolution {
  id: string;
  createdAt?: number;
  [key: string]: unknown;
}

const SAFE_ID = /^[a-zA-Z0-9._-]+$/;

function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(translate("Geçersiz çözüm kimliği."));
  }
}

function isStoredSolution(value: unknown): value is StoredSolution {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    SAFE_ID.test((value as { id: string }).id)
  );
}

export class SolutionFileStore {
  private summaries = new Map<string, { stamp: string; summary: LibrarySummary }>();

  private migration?: Promise<void>;

  public constructor(private readonly directory: string, private readonly legacyDirectory?: string) {}

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    if (this.legacyDirectory) {
      this.migration ??= migrateSolutionDirectory(this.legacyDirectory, this.directory);
      try { await this.migration; }
      catch (error) { this.migration = undefined; throw error; }
    }
  }

  private filePath(id: string): string {
    assertSafeId(id);
    return path.join(this.directory, `${id}.json`);
  }

  public async list(): Promise<StoredSolution[]> {
    await this.ensureDirectory();
    const entries = await readdir(this.directory, { withFileTypes: true });
    const items: StoredSolution[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const raw = await readFile(path.join(this.directory, entry.name), 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (isStoredSolution(parsed)) items.push(parsed);
      } catch (error) {
        console.warn(`[KATMANDU] Corrupt solution file skipped: ${entry.name}`, error instanceof Error ? error.name : 'UnknownError');
      }
    }

    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /** Cache summaries by file stamp; unchanged documents are not parsed again. */
  public async listSummaries(): Promise<LibrarySummary[]> {
    await this.ensureDirectory();
    const entries = await readdir(this.directory, { withFileTypes: true });
    const existing = new Set<string>();
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      existing.add(entry.name);
      try {
        const filename = path.join(this.directory, entry.name);
        const info = await stat(filename);
        const stamp = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
        if (this.summaries.get(entry.name)?.stamp === stamp) continue;
        const item: unknown = JSON.parse(await readFile(filename, 'utf8'));
        if (isStoredSolution(item) && typeof item.title === 'string' && typeof item.createdAt === 'number') {
          this.summaries.set(entry.name, { stamp, summary: summarizeLibraryItem(item as unknown as LibraryItem) });
        } else this.summaries.delete(entry.name);
      } catch (error) {
        this.summaries.delete(entry.name);
        console.warn(`[KATMANDU] Corrupt solution file skipped: ${entry.name}`, error instanceof Error ? error.name : 'UnknownError');
      }
    }
    for (const name of this.summaries.keys()) if (!existing.has(name)) this.summaries.delete(name);
    return [...this.summaries.values()].map(entry => entry.summary).sort((a, b) => b.createdAt - a.createdAt);
  }

  public async get(id: string): Promise<StoredSolution | null> {
    await this.ensureDirectory();
    try {
      const raw = await readFile(this.filePath(id), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return isStoredSolution(parsed) ? parsed : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  public async save(item: StoredSolution): Promise<void> {
    if (!isStoredSolution(item)) throw new Error(translate("Geçersiz çözüm kaydı."));
    await this.ensureDirectory();
    const destination = this.filePath(item.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(item, null, 2)}\n`, 'utf8');
    try {
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  public async delete(id: string): Promise<void> {
    await this.ensureDirectory();
    try {
      await unlink(this.filePath(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  public async clear(): Promise<void> {
    await this.ensureDirectory();
    const entries = await readdir(this.directory, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => unlink(path.join(this.directory, entry.name)))
    );
  }
}
