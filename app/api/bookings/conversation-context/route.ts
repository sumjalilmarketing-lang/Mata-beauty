import { authenticatedSupabase, serviceSupabase } from "@/lib/payments/server";

const headers = { "Cache-Control": "private, no-store" };
type BookingContext = { client_id: string; provider_id: string; starts_at: string; status: string; service_title?: string };

export async function GET(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const bookingId = new URL(request.url).searchParams.get("booking");
  if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return Response.json({ error: "invalid_booking" }, { status: 400, headers });
  }
  // Read through RLS first. Administrative visibility alone never grants access
  // to the private identity context of a conversation.
  const { data: booking, error } = await auth.client.from("bookings")
    .select("client_id,provider_id,starts_at,status").eq("id", bookingId).maybeSingle();
  if (error) return Response.json({ error: "unavailable" }, { status: 503, headers });
  let staffBooking: BookingContext | null = null;
  if (!booking || ![booking.client_id, booking.provider_id].includes(auth.user.id)) {
    if (process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED !== "true") {
      return Response.json({ error: "not_found" }, { status: 404, headers });
    }
    const staff = await auth.client.rpc("get_staff_booking_context", { target_booking_id: bookingId });
    const result = Array.isArray(staff.data) ? staff.data[0] as BookingContext | undefined : null;
    if (staff.error || !result) return Response.json({ error: "not_found" }, { status: 404, headers });
    staffBooking = result;
  }
  const context: BookingContext | null = booking ?? staffBooking;
  if (!context) {
    return Response.json({ error: "not_found" }, { status: 404, headers });
  }
  const otherId = staffBooking ? context.client_id : context.client_id === auth.user.id ? context.provider_id : context.client_id;
  // Do not widen the profiles SELECT policy: only the participant's public name
  // is returned here, never email, phone, address or the rest of their profile.
  const service = serviceSupabase();
  const [profile, provider] = await Promise.all([
    service.from("profiles").select("display_name,first_name,last_name").eq("id", otherId).maybeSingle(),
    !staffBooking && otherId === context.provider_id
      ? service.from("provider_profiles").select("business_name").eq("profile_id", otherId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (profile.error || provider.error) return Response.json({ error: "unavailable" }, { status: 503, headers });
  const name = provider.data?.business_name?.trim() || profile.data?.display_name?.trim()
    || [profile.data?.first_name, profile.data?.last_name].filter(Boolean).join(" ")
    || (otherId === context.provider_id ? "Professionnel" : "Client");
  return Response.json({ name, startsAt: context.starts_at, status: context.status }, { headers });
}
