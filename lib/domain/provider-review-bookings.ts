import type { SupabaseClient } from "@supabase/supabase-js";
export const reviewBookingPageSize = 20;
export async function loadProviderReviewBookings(client: SupabaseClient, providerId: string, page: number, signal: AbortSignal, businessId?: string) {
  const owned = await client.from("businesses").select("id").eq("owner_id", providerId).is("archived_at", null).abortSignal(signal);
  if (owned.error) throw owned.error;
  const ids = (owned.data ?? []).map((row: { id: string }) => row.id);
  let query = client.from("bookings").select("id,starts_at,provider_services(title)").eq("status", "completed");
  query = ids.length ? query.or(`provider_id.eq.${providerId},business_id.in.(${ids.join(",")})`) : query.eq("provider_id", providerId);
  if (businessId) query = query.eq("business_id", businessId);
  return query.order("starts_at", { ascending: false }).order("id", { ascending: false }).range(page * reviewBookingPageSize, (page + 1) * reviewBookingPageSize).abortSignal(signal);
}
