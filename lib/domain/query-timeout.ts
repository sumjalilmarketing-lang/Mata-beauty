export class QueryTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`La requête a dépassé ${timeoutMs} ms.`);
    this.name = "QueryTimeoutError";
  }
}

/**
 * Bounds a request even when the underlying transport ignores AbortSignal.
 * The signal is still aborted at timeout so fetch/PostgREST can stop work.
 */
export function withQueryTimeout<T>(
  request: (signal: AbortSignal) => PromiseLike<T> | Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
      callback();
    };
    const abortFromParent = () => {
      controller.abort();
      finish(() => reject(new DOMException("Requête annulée.", "AbortError")));
    };
    const timeout = setTimeout(() => {
      controller.abort();
      finish(() => reject(new QueryTimeoutError(timeoutMs)));
    }, timeoutMs);

    if (parentSignal?.aborted) {
      abortFromParent();
      return;
    }
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });

    Promise.resolve()
      .then(() => request(controller.signal))
      .then((value) => finish(() => resolve(value)))
      .catch((error: unknown) => finish(() => reject(error)));
  });
}
