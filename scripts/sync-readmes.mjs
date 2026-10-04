import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(await readFile(path.join(root, 'docs/readme.content.json'), 'utf8'));
const check = process.argv.includes('--check');
const ids = new Set();
for (const section of source.sections) {
  if (!section.id || ids.has(section.id)) throw new Error('Documentation section IDs must be unique.');
  ids.add(section.id);
  for (const language of ['en', 'tr']) {
    if (!section[language]?.title?.trim() || !section[language]?.body?.trim()) {
      throw new Error(`Missing ${language} documentation for ${section.id}.`);
    }
  }
}
let stale = false;
for (const language of ['en', 'tr']) {
  const file = language === 'en' ? 'README.md' : 'README.tr.md';
  const switchLink = language === 'en' ? '[Türkçe README](README.tr.md)' : '[English README](README.md)';
  const content = `<!-- Generated together from docs/readme.content.json. Edit both languages there and run npm run docs:sync. -->\n\n# ${source.title}\n\n${switchLink}\n\n` +
    source.sections.map(section => `## ${section[language].title}\n\n${section[language].body}\n`).join('\n');
  if (check) {
    let current = '';
    try { current = await readFile(path.join(root, file), 'utf8'); } catch { /* A missing README is stale. */ }
    if (current !== content) { console.error(`${file} is out of date. Update both translations and run npm run docs:sync.`); stale = true; }
  } else {
    await writeFile(path.join(root, file), content);
    console.log(`Updated ${file}`);
  }
}
if (stale) process.exitCode = 1;
