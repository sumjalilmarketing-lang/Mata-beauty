type PlaybackSnapshot = { time: number; paused: boolean; savedAt: number };
const prefix = "mata-video-resume-v1:";

export function parseVideoResume(value: string | null, duration: number, now: number): PlaybackSnapshot | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const entry = parsed as Partial<PlaybackSnapshot>;
    if (typeof entry.time !== "number" || !Number.isFinite(entry.time) || entry.time < 0 || typeof entry.paused !== "boolean" || typeof entry.savedAt !== "number" || now - entry.savedAt > 60 * 60 * 1000 || entry.savedAt > now) return null;
    return { time: Number.isFinite(duration) && entry.time >= duration ? 0 : entry.time, paused: entry.paused, savedAt: entry.savedAt };
  } catch { return null; }
}

export function readVideoResume(postId: string, duration: number) {
  try { return parseVideoResume(window.sessionStorage.getItem(prefix + postId), duration, Date.now()); } catch { return null; }
}

export function saveVideoResume(postId: string, time: number, paused: boolean) {
  try { window.sessionStorage.setItem(prefix + postId, JSON.stringify({ time, paused, savedAt: Date.now() })); } catch { /* Navigation still works if storage is disabled. */ }
}
