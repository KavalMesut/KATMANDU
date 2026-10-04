import { translate } from '../i18n';
export class TabRequestTracker {
  private requests = new Map<string, { token: symbol; controller: AbortController; timer: ReturnType<typeof setTimeout> }>();

  begin(tabId: string, timeoutMs = 300000): symbol {
    this.cancel(tabId);
    const token = Symbol(tabId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException(translate("İşlem zaman aşımına uğradı. Tekrar deneyebilir veya süre sınırını Ayarlar’dan artırabilirsiniz."), 'TimeoutError')), timeoutMs);
    this.requests.set(tabId, { token, controller, timer });
    return token;
  }
  signal(tabId: string, token: symbol): AbortSignal {
    const request = this.requests.get(tabId);
    if (!request || request.token !== token) return AbortSignal.abort(new DOMException(translate("İşlem durduruldu."), 'AbortError'));
    return request.controller.signal;
  }
  isCurrent(tabId: string, token: symbol): boolean { return this.requests.get(tabId)?.token === token; }
  finish(tabId: string, token: symbol): void {
    if (!this.isCurrent(tabId, token)) return;
    clearTimeout(this.requests.get(tabId)!.timer);
    this.requests.delete(tabId);
  }
  cancel(tabId: string): void {
    const request = this.requests.get(tabId);
    if (!request) return;
    clearTimeout(request.timer);
    this.requests.delete(tabId);
    request.controller.abort(new DOMException(translate("İşlem durduruldu."), 'AbortError'));
  }
  clear(): void { for (const id of this.requests.keys()) this.cancel(id); }
}
