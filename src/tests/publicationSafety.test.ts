import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';
import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoBuildSecrets, PRIVATE_FILE_DENY_LIST, publicationSafetyPlugin } from '../../server/publicationSafety';
import { solutionApiPlugin } from '../../server/solutionApiPlugin';

describe('production credential guard', () => {
  it.each(['VITE_OPENAI_API_KEY', 'VITE_GEMINI_API_KEY', 'VITE_DEEPSEEK_API_KEY', 'VITE_OPENROUTER_API_KEY'])('rejects a populated %s without exposing its value', name => {
    const secret = 'private-build-fixture';
    let message = '';
    try { assertNoBuildSecrets({ [name]: secret }); }
    catch (error) { message = (error as Error).message; }
    expect(message).toContain('Production build blocked');
    expect(message).toContain(name);
    expect(message).not.toContain(secret);
  });
  it('allows empty credentials and public model settings', () => {
    expect(() => assertNoBuildSecrets({ VITE_GEMINI_API_KEY: '  ', VITE_OPENAI_MODEL: 'sample-model' })).not.toThrow();
  });
});

describe('private workspace files over HTTP', () => {
  let directory: string, server: ViteDevServer, previewServer: PreviewServer, base: string, previewBase: string;
  const files = ['.env.local', '.git/config', 'solutions/private.json', 'solutions/legacy-cozumler/old.json', 'cozumler/private.json', 'basarisiz_deneme/notes.md', 'tasarim_secenekleri/private.png', 'KATMANDU.desktop', 'FUTURE_ROADMAP.md', 'EXPORT_ROADMAP.md', 'AGENTS.md'];
  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'katmandu-publication-'));
    for (const file of files) {
      const target = path.join(directory, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.endsWith('.json') ? JSON.stringify({ id: 'private', createdAt: 1 }) : 'private-test-fixture');
    }
    await writeFile(path.join(directory, 'index.html'), '<html><body>public-interface</body></html>');
    server = await createServer({
      configFile: false, root: directory, logLevel: 'silent', plugins: [publicationSafetyPlugin(), solutionApiPlugin()],
      server: { host: '127.0.0.1', port: 0, fs: { deny: PRIVATE_FILE_DENY_LIST } }
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address.');
    base = `http://127.0.0.1:${address.port}`;
    await mkdir(path.join(directory, 'dist'));
    await writeFile(path.join(directory, 'dist/index.html'), '<html><body>public-preview</body></html>');
    previewServer = await preview({
      configFile: false, root: directory, logLevel: 'silent', plugins: [solutionApiPlugin()],
      preview: { host: '127.0.0.1', port: 0, allowedHosts: ['trusted.example.invalid'] }
    });
    const previewAddress = previewServer.httpServer.address();
    if (!previewAddress || typeof previewAddress === 'string') throw new Error('Missing preview address.');
    previewBase = `http://127.0.0.1:${previewAddress.port}`;
  });
  afterAll(async () => {
    await server?.close();
    if (previewServer) await new Promise<void>(resolve => previewServer.httpServer.close(() => resolve()));
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it.each(files)('blocks direct and raw reads of %s', async file => {
    for (const suffix of ['', '?raw', '?import']) {
      const response = await fetch(`${base}/${file}${suffix}`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('private-test-fixture');
    }
    expect((await fetch(`${base}/@fs${directory}/${file}`)).status).toBe(403);
  });
  it('keeps the public interface and protected archive API working', async () => {
    expect(await (await fetch(base)).text()).toContain('public-interface');
    const response = await fetch(`${base}/api/library`);
    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([{ id: 'private', createdAt: 1 }]);
    expect((await fetch(`${base}/api/library`, { headers: { Origin: 'https://other.invalid' } })).status).toBe(403);
  });
  async function withHost(url: string, host: string): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
      const request = httpRequest(`${url}/api/library`, { headers: { Host: host, Origin: `http://${host}` } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject); request.end();
    });
  }
  it('rejects rebinding hosts before archive access on development and preview servers', async () => {
    expect(await withHost(base, 'attacker.invalid')).toBe(403);
    expect(await withHost(previewBase, 'attacker.invalid')).toBe(403);
    expect((await fetch(`${previewBase}/api/library`)).status).toBe(200);
  });
  it('allows explicitly configured preview hostnames without trusting other domains', async () => {
    expect(await withHost(previewBase, 'trusted.example.invalid')).toBe(200);
    expect(await withHost(previewBase, 'trusted.example.invalid.attacker.invalid')).toBe(403);
  });
});
