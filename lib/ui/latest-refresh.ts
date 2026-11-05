/** Ignore obsolete responses even when the underlying transport ignores abort. */
export function latestRefresh<T>(read: (signal: AbortSignal) => Promise<T>, onData: (data: T) => void, onError: () => void) {
  let active = true;
  let version = 0;
  let controller: AbortController | undefined;
  return {
    async refresh() {
      if (!active) return;
      const current = ++version;
      controller?.abort();
      controller = new AbortController();
      try {
        const data = await read(controller.signal);
        if (active && current === version) onData(data);
      } catch {
        if (active && current === version) onError();
      }
    },
    stop() { active = false; controller?.abort(); },
  };
}
