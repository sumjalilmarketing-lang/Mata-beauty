import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSessionMetric } from "./session-metric";

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
  const result = await recordSessionMetric(client, "record_product_event", {
    target_event_name: eventName,
    target_properties: safeProperties(properties),
  }, "mata-analytics-session");
  return result.ok;
}
