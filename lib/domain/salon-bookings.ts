import type { SupabaseClient } from "@supabase/supabase-js";

export type SalonBooking = { service_snapshot?: unknown; id: string; starts_at: string; ends_at: string; status: string; total_amount: number; currency: string; collaborator_id: string | null; provider_service_id: string };

export async function loadSalonBookings(client: SupabaseClient, businessId: string, signal: AbortSignal): Promise<SalonBooking[]> {
  const { data, error } = await client.from("bookings")
    .select("id,starts_at,ends_at,status,total_amount,currency,collaborator_id,provider_service_id,service_snapshot")
    .eq("business_id", businessId).order("starts_at", { ascending: false }).limit(200)
    .abortSignal(signal);
  if (error) throw error;
  return (data ?? []) as SalonBooking[];
}
