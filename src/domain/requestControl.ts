import { translate } from '../i18n';
import type { AppConfig } from './config';

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason || new DOMException(translate("İşlem durduruldu."), 'AbortError');
}
export function isRequestStopped(error: unknown): boolean {
  return error instanceof Error && ['AbortError', 'TimeoutError', 'BudgetError'].includes(error.name);
}
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}
export function requestTimeout(config: AppConfig): number {
  const seconds = config.requestTimeoutSeconds;
  return (typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(30, Math.min(900, seconds)) : 300) * 1000;
}

/** A single queue bounds solution, detection, expansion and routing operations. */
export class RequestScheduler {
  private running = 0;
  private queue: Array<() => void> = [];
  public limit = 2;
  run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      const stop = () => {
        const index = this.queue.indexOf(start);
        if (index >= 0) this.queue.splice(index, 1);
        reject(signal.reason);
      };
      const start = () => {
        signal.removeEventListener('abort', stop);
        if (signal.aborted) { reject(signal.reason); this.drain(); return; }
        this.running++;
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve().then(task).then(value => { throwIfAborted(signal); resolve(value); }, reject)
          .catch(reject).finally(() => {
            signal.removeEventListener('abort', onAbort);
            this.running--; this.drain();
          });
      };
      signal.addEventListener('abort', stop, { once: true });
      this.queue.push(start);
      this.drain();
    });
  }
  private drain() {
    while (this.running < this.limit && this.queue.length) this.queue.shift()!();
  }
}
export const requestScheduler = new RequestScheduler();
