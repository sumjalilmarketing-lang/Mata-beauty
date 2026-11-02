/** Reload even when renewed signing returns the same URL React already rendered. */
export function reloadVideoSource(video: Pick<HTMLVideoElement, "src" | "load">, source: string): void {
  video.src = source;
  video.load();
}

/** Share one recovery request per post; clear both successful and failed attempts. */
export function createVideoRefreshQueue<T>() {
  const pending = new Map<string, Promise<T>>();
  return {
    isPending: (postId: string) => pending.has(postId),
    run(postId: string, refresh: () => Promise<T>): Promise<T> {
      const existing = pending.get(postId);
      if (existing) return existing;
      const request = Promise.resolve().then(refresh).finally(() => pending.delete(postId));
      pending.set(postId, request);
      return request;
    },
  };
}
