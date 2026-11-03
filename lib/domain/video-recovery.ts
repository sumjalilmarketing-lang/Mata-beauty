/** Reload even when renewed signing returns the same URL React already rendered. */
export function reloadVideoSource(video: Pick<HTMLVideoElement, "src" | "load"> & Partial<Pick<HTMLVideoElement, "currentTime" | "duration" | "addEventListener">>, source: string): void {
  const position = video.currentTime ?? 0;
  if (position > 0 && Number.isFinite(position)) {
    video.addEventListener?.("loadedmetadata", () => {
      if (video.src !== source) return;
      const duration = video.duration;
      const target = duration !== undefined && Number.isFinite(duration) && duration > 0 ? Math.min(position, Math.max(0, duration - 0.05)) : position;
      try { video.currentTime = target; } catch { /* Non-seekable sources can restart normally. */ }
    }, { once: true });
  }
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

/** Mobile browsers may deny sound autoplay; allow playback without a black screen. */
export async function playFeedVideo(video: Pick<HTMLVideoElement, "play" | "muted">, onMuted: () => void): Promise<void> {
  try { await video.play(); }
  catch (error) {
    if (!video.muted && error instanceof Error && error.name === "NotAllowedError") {
      video.muted = true;
      try { await video.play(); onMuted(); } catch { /* A user gesture may still be required. */ }
    }
  }
}

export function feedVideoPreload(active: boolean, saveData: boolean): "auto" | "metadata" {
  return active || !saveData ? "auto" : "metadata";
}
