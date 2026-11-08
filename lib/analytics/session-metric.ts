import type { SupabaseClient } from "@supabase/supabase-js";
import { analyticsChoice, subscribeAnalyticsChoice } from "./consent";

type MetricName = "record_product_event" | "record_video_view" | "record_post_share" | "record_post_booking_click" | "record_social_profile_visit";
type MetricResult = { ok: boolean; data: unknown };

export async function analyticsSessionHash(key: string): Promise<string | null> {
  try {
    if (typeof window === "undefined" || analyticsChoice() !== "accepted") return null;
    const storage = window.sessionStorage;
    let session = storage.getItem(key);
    if (!session) { session = crypto.randomUUID(); storage.setItem(key, session); }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

// Metrics are optional: storage restrictions, transport failures and page exits
// must never become failures of a booking, profile navigation or media playback.
export async function recordSessionMetric(
  client: SupabaseClient,
  name: MetricName,
  parameters: Record<string, unknown>,
  sessionKey = "mata-feed-session",
  parentSignal?: AbortSignal,
): Promise<MetricResult> {
  const failed = { ok: false, data: null };
  if (parentSignal?.aborted) return failed;
  const hash = await analyticsSessionHash(sessionKey);
  if (!hash || parentSignal?.aborted || analyticsChoice() !== "accepted") return failed;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const unsubscribe = subscribeAnalyticsChoice(() => { if (analyticsChoice() !== "accepted") abort(); });
  const timeout = setTimeout(abort, 5000);
  parentSignal?.addEventListener("abort", abort, { once: true });
  try {
    if (name === "record_product_event") {
      const response = await fetch("/api/analytics/product-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...parameters, target_session_hash: hash }),
        signal: controller.signal,
      });
      return !response.ok || controller.signal.aborted ? failed : { ok: true, data: null };
    }
    const { data, error } = await client.rpc(name, { ...parameters, target_session_hash: hash }).abortSignal(controller.signal);
    return error || controller.signal.aborted ? failed : { ok: true, data };
  } catch { return failed; }
  finally { clearTimeout(timeout); parentSignal?.removeEventListener("abort", abort); unsubscribe(); }
}
