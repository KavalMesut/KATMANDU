import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../domain/config';
import { UsageTracker } from '../domain/usageReport';
import { ProviderTransport } from '../providers/providerTransport';
import { safeJsonParse } from '../domain/jsonRepair';
import { fetchProvider } from '../domain/providerSecurity';
import { fetchModelCatalog } from '../domain/modelCatalog';
import { createTranslator, setLanguage } from '../i18n';
import { createServer } from 'node:http';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('provider credential and payload protection', () => {
  it.each(['http://api.example.invalid/v1', 'ftp://localhost/v1', 'https://user:password@example.invalid/v1'])('rejects unsafe credential destinations: %s', async url => {
    const network = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', network);
    const transport = new ProviderTransport(DEFAULT_CONFIG, 'openai', new UsageTracker());
    await expect(transport.fetch(url, { headers: { Authorization: 'Bearer synthetic-test-key' } })).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });

  it.each(['https://api.example.invalid/v1', 'http://localhost:1234/v1', 'http://127.0.0.1:1234/v1', 'http://[::1]:1234/v1'])('permits secure providers and local proxies: %s', async url => {
    const network = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', network);
    const transport = new ProviderTransport(DEFAULT_CONFIG, 'openai', new UsageTracker());
    await transport.fetch(url, { headers: { Authorization: 'Bearer synthetic-test-key' } });
    expect(network).toHaveBeenCalledOnce();
  });

  it('does not include private model responses in parse errors or console logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let error: unknown;
    try { safeJsonParse('PRIVATE_QUESTION_CONTENT invalid JSON'); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('PRIVATE_QUESTION_CONTENT');
    expect(log).not.toHaveBeenCalled();
  });

  it('retains the operation language when a malformed response arrives after a language change', () => {
    const english = createTranslator('en');
    setLanguage('tr');
    expect(() => safeJsonParse('private invalid JSON', english)).toThrow('The model response could not be read as valid JSON.');
  });

  it('does not follow a real redirect with credentials, even if follow is requested', async () => {
    const paths: string[] = [];
    const server = createServer((request, response) => {
      paths.push(request.url || '');
      if (request.url === '/redirect') { response.statusCode = 302; response.setHeader('Location', '/target'); }
      response.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing server address');
      await expect(fetchProvider(`http://127.0.0.1:${address.port}/redirect`, {
        redirect: 'follow', headers: { Authorization: 'Bearer synthetic-test-key' }
      })).rejects.toThrow();
      expect(paths).toEqual(['/redirect']);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it.each(['openai', 'deepseek', 'openrouter'] as const)('does not send catalog credentials to an insecure %s endpoint', async provider => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const network = vi.fn(); vi.stubGlobal('fetch', network);
    const config = { ...DEFAULT_CONFIG, [`${provider}ApiKey`]: 'synthetic-test-key', [`${provider}BaseUrl`]: 'http://remote.example.invalid/v1' };
    await expect(fetchModelCatalog(config, provider, true)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
});
