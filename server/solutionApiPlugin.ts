import { translate, createTranslator } from '../src/i18n';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { isIP } from 'node:net';
import type { Plugin } from 'vite';
import { SolutionFileStore, type StoredSolution } from './solutionFileStore';

const API_PREFIX = '/api/library';
const MAX_BODY_BYTES = 50 * 1024 * 1024;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error(translate("Çözüm kaydı 50 MB sınırını aşıyor."));
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function allowedHost(host: string | undefined, allowedHosts: readonly string[]): boolean {
  if (!host) return false;
  try {
    const url = new URL(`http://${host}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(hostname.replace(/^\[|\]$/g, ''))) return true;
    return allowedHosts.some(entry => hostname === entry ||
      (entry.startsWith('.') && (hostname === entry.slice(1) || hostname.endsWith(entry))));
  } catch { return false; }
}

export function createHandler(store: SolutionFileStore, allowedHosts: readonly string[] = []) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const translate = createTranslator(request.headers['x-katmandu-language'] === 'tr' ? 'tr' : 'en');
    let url: URL;
    try { url = new URL(request.url || '/', 'http://katmandu.local'); }
    catch {
      sendJson(response, 400, { error: translate("Geçersiz istek adresi.") });
      return;
    }
    if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) {
      next();
      return;
    }

    try {
      // This middleware runs before Vite's own Host check; enforce it here too.
      if (!allowedHost(request.headers.host, allowedHosts)) {
        sendJson(response, 403, { error: translate("Arşive bu alan adı üzerinden erişilemez.") });
        return;
      }
      const origin = request.headers.origin;
      const protocol = 'encrypted' in request.socket && request.socket.encrypted ? 'https' : 'http';
      const expectedOrigin = new URL(`${protocol}://${request.headers.host}`).origin;
      if ((origin && origin !== expectedOrigin) || request.headers['sec-fetch-site'] === 'cross-site') {
        sendJson(response, 403, { error: translate("Arşive başka bir siteden erişilemez.") });
        return;
      }
      if (request.method !== 'GET' && request.headers['x-katmandu-request'] !== 'library-ui') {
        sendJson(response, 403, { error: translate("Arşiv işlemi uygulama üzerinden yapılmalı.") });
        return;
      }
      const encodedId = url.pathname === API_PREFIX ? '' : url.pathname.slice(`${API_PREFIX}/`.length);
      const id = encodedId ? decodeURIComponent(encodedId) : null;
      if (request.method === 'GET' && !id) {
        sendJson(response, 200, { items: url.searchParams.get('summary') === '1' ? await store.listSummaries() : await store.list() });
        return;
      }
      if (request.method === 'GET' && id) {
        sendJson(response, 200, { item: await store.get(id) });
        return;
      }
      if (request.method === 'PUT' && id) {
        const item = await readJsonBody(request) as StoredSolution;
        if (!item || item.id !== id) {
          sendJson(response, 400, { error: translate("URL ile çözüm kimliği eşleşmiyor.") });
          return;
        }
        await store.save(item);
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'DELETE' && id) {
        await store.delete(id);
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'DELETE' && !id) {
        await store.clear();
        sendJson(response, 200, { ok: true });
        return;
      }
      sendJson(response, 405, { error: translate("Desteklenmeyen yöntem.") });
    } catch (error) {
      // JSON parser and filesystem errors can contain private text or absolute paths.
      console.error('[KATMANDU] Solution file operation failed:', error instanceof Error ? error.name : 'UnknownError');
      sendJson(response, 500, {
        error: translate("Çözüm dosyası işlemi başarısız.")
      });
    }
  };
}

export function solutionApiPlugin(): Plugin {
  const createStore = (root: string) => new SolutionFileStore(path.resolve(root, 'solutions'), path.resolve(root, 'cozumler'));
  let store = createStore(process.cwd());
  let devHosts: string[] = [], previewHosts: string[] = [];

  return {
    name: 'katmandu-solution-json-storage',
    configResolved(config) {
      store = createStore(config.root);
      devHosts = Array.isArray(config.server.allowedHosts) ? config.server.allowedHosts : [];
      previewHosts = Array.isArray(config.preview.allowedHosts) ? config.preview.allowedHosts : [];
    },
    configureServer(server) {
      server.middlewares.use(createHandler(store, devHosts));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createHandler(store, previewHosts));
    }
  };
}
