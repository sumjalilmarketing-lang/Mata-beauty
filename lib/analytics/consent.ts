import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../browser-storage";

export type AnalyticsChoice = "accepted" | "rejected";
const key = "mata-analytics-choice-v1";
const eventName = "mata:analytics-choice";
const lifetime = 180 * 24 * 60 * 60 * 1000;
let disabledForPage = false;

export function analyticsChoice(): AnalyticsChoice | null {
  try {
    if (disabledForPage) return null;
    const raw = readBrowserStorage("localStorage", key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("choice" in value) || !("savedAt" in value)) return null;
    if (value.choice !== "accepted" && value.choice !== "rejected") return null;
    if (typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt) || value.savedAt > Date.now() || Date.now() - value.savedAt >= lifetime) return null;
    return value.choice;
  } catch { return null; }
}

export function setAnalyticsChoice(choice: AnalyticsChoice): boolean {
  const saved = writeBrowserStorage("localStorage", key, JSON.stringify({ choice, savedAt: Date.now() }));
  disabledForPage = !saved;
  if (!saved) removeBrowserStorage("localStorage", key);
  if (!saved || choice === "rejected") {
    removeBrowserStorage("sessionStorage", "mata-analytics-session");
    removeBrowserStorage("sessionStorage", "mata-feed-session");
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName));
  return saved;
}

export function subscribeAnalyticsChoice(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(eventName, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener("storage", listener); };
}
