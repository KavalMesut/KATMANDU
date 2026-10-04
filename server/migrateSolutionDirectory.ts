import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, rmdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { translate } from '../src/i18n';

/** Move legacy files without changing IDs, historical metadata or file contents. */
export async function migrateSolutionDirectory(legacy: string, destination: string): Promise<void> {
  let info;
  try { info = await lstat(legacy); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (!info.isDirectory()) throw new Error(translate('Eski çözüm arşivi normal bir klasör olmalıdır.'));
  await mkdir(destination, { recursive: true });
  const entries = await readdir(legacy, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(json|tmp)$/.test(entry.name)) continue;
    const source = path.join(legacy, entry.name);
    const target = path.join(destination, entry.name);
    try {
      // Never overwrite an existing solution, even if two servers start together.
      await copyFile(source, target, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const [oldContents, newContents] = await Promise.all([readFile(source), readFile(target)]);
      if (!oldContents.equals(newContents)) {
        const backupDirectory = path.join(destination, 'legacy-cozumler');
        await mkdir(backupDirectory, { recursive: true });
        const backup = path.join(backupDirectory, `${randomUUID()}-${entry.name}`);
        await copyFile(source, backup, constants.COPYFILE_EXCL);
        console.warn(`[KATMANDU] ${translate('Çakışan eski çözüm dosyası yedek klasöründe korundu:')} ${backup}`);
      }
    }
    try { await unlink(source); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  // Other user files stay in place; remove the old directory only when empty.
  try { await rmdir(legacy); }
  catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
  }
}
