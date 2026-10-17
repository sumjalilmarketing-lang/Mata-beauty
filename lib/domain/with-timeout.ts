export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
  }
}

export function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(new RequestTimeoutError(timeoutMs));
      }
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(operation), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
