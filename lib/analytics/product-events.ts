import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductEventName =
  | "signup_started" | "signup_completed" | "provider_onboarding_started" | "provider_onboarding_completed"
  | "search" | "category_viewed" | "provider_viewed" | "social_post_viewed"
  | "booking_started" | "booking_completed" | "booking_cancelled" | "favorite_added"
  | "message_sent" | "social_post_published" | "video_to_booking_click" | "review_created";

function safeProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) =>
    value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean",
  ));
}

export async function recordProductEvent(
  client: SupabaseClient,
  eventName: ProductEventName,
  properties: Record<string, unknown> = {},
) {
  let sessionHash: string | null = null;
  if (typeof window !== "undefined") {
    const key = "mata-analytics-session";
    let sessionId = window.sessionStorage.getItem(key);
    if (!sessionId) { sessionId = crypto.randomUUID(); window.sessionStorage.setItem(key, sessionId); }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId));
    sessionHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const { error } = await client.rpc("record_product_event", {
    target_event_name: eventName,
    target_properties: safeProperties(properties),
    target_session_hash: sessionHash,
  });
  return !error;
}
