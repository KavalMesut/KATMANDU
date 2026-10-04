import { translate } from '../i18n';

/** Credentials may only travel over HTTPS, except to a local loopback proxy. */
export function assertSafeProviderUrl(url: string, localize: typeof translate = translate): void {
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error(localize("Sağlayıcı adresi geçersiz.")); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.username || parsed.password ||
    (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))) {
    throw new Error(localize("Sağlayıcı adresi HTTPS kullanmalıdır; HTTP yalnızca yerel localhost bağlantılarında kullanılabilir. Adrese kullanıcı adı veya parola eklemeyin."));
  }
}

export function fetchProvider(url: string, init: RequestInit = {}, localize: typeof translate = translate): Promise<Response> {
  assertSafeProviderUrl(url, localize);
  // Do not forward a credential-bearing request through an unchecked redirect.
  return fetch(url, { ...init, redirect: 'error' });
}
