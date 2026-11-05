import type { SupabaseClient } from "@supabase/supabase-js";
export const reviewBookingPageSize = 20;
export async function loadClientReviewBookings(client: SupabaseClient, clientId: string, page: number, signal: AbortSignal) {
  return client.from("bookings").select("id,starts_at,provider_services(title)")
    .eq("client_id", clientId).eq("status", "completed")
    .order("starts_at", { ascending: false }).order("id", { ascending: false })
    .range(page * reviewBookingPageSize, (page + 1) * reviewBookingPageSize)
    .abortSignal(signal);
}
