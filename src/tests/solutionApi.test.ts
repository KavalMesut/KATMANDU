import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SolutionFileStore } from '../../server/solutionFileStore';
import { createHandler } from '../../server/solutionApiPlugin';
let directory: string, server: Server, base: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'katmandu-api-'));
  const handler = createHandler(new SolutionFileStore(directory));
  server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('server');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});
describe('local archive API protection', () => {
  it.each(['GET', 'DELETE'])('rejects DNS rebinding hosts for %s even with a matching origin', async method => {
    // Use raw HTTP: fetch may replace Host with the URL's hostname.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(`${base}/api/library`, { method, headers: {
        Host: 'attacker.invalid', Origin: 'http://attacker.invalid',
        'Sec-Fetch-Site': 'same-origin', 'X-Katmandu-Request': 'library-ui'
      } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      request.on('error', reject); request.end();
    });
    expect(status).toBe(403);
  });

  it('does not expose corrupt archive contents or server paths in errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await writeFile(path.join(directory, 'corrupt.json'), 'PRIVATE_QUESTION_CONTENT not valid JSON');
      const response = await fetch(`${base}/api/library/corrupt`);
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).not.toContain('PRIVATE_QUESTION_CONTENT');
      expect(body).not.toContain(directory);
      expect(body).toContain('Solution file operation failed.');
    } finally { log.mockRestore(); }
  });

  it.each([['en', 'Archive operations must be performed through the application.'], ['tr', 'Arşiv işlemi uygulama üzerinden yapılmalı.']])('returns archive errors in the requested %s language', async (language, expected) => {
    const response = await fetch(`${base}/api/library`, { method: 'DELETE', headers: { 'X-Katmandu-Language': language } });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(expected);
  });

  it('rejects cross-origin reads and writes', async () => {
    expect((await fetch(`${base}/api/library`, { headers: { Origin: 'https://another-site.invalid' } })).status).toBe(403);
    expect((await fetch(`${base}/api/library`, { method: 'DELETE', headers: { Origin: 'https://another-site.invalid', 'X-Katmandu-Request': 'library-ui' } })).status).toBe(403);
  });
  it('requires the application header for destructive requests', async () => {
    expect((await fetch(`${base}/api/library`, { method: 'DELETE' })).status).toBe(403);
    expect((await fetch(`${base}/api/library`, { method: 'DELETE', headers: { 'X-Katmandu-Request': 'library-ui', Origin: base } })).status).toBe(200);
  });
  it('returns summaries without attachment or solution payloads', async () => {
    const body = { id: 'a', title: 'test', createdAt: 1, problemText: 'q', discipline: 'fizik', category: 'mechanics', tags: [], layers: [], document: { attachments: ['large-image'] } };
    expect((await fetch(`${base}/api/library/a`, { method: 'PUT', body: JSON.stringify(body), headers: { 'X-Katmandu-Request': 'library-ui', 'Content-Type': 'application/json' } })).status).toBe(200);
    const result = await (await fetch(`${base}/api/library?summary=1`)).json();
    expect(result.items[0]).toMatchObject({ id: 'a', layerCount: 0 }); expect(result.items[0]).not.toHaveProperty('document');
    expect((await (await fetch(`${base}/api/library/a`)).json()).item.document.attachments).toEqual(['large-image']);
  });
  it('handles malformed identifiers without an unhandled rejection', async () => {
    expect((await fetch(`${base}/api/library/%XX`)).status).toBe(500);
  });
  it('handles malformed request URLs without an unhandled rejection', async () => {
    const result = await new Promise<{ status?: number; body: string }>((resolve, reject) => {
      const request = httpRequest(base, { path: '//[' }, response => {
        let body = ''; response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body }));
      });
      request.on('error', reject); request.end();
    });
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Invalid request URL.');
  });
});
