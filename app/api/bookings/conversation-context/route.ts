import { authenticatedSupabase, serviceSupabase } from "@/lib/payments/server";

const headers = { "Cache-Control": "private, no-store" };
type BookingContext = {
  id: string;
  client_id: string;
  provider_id: string;
  starts_at: string;
  status: string;
};
type Profile = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  role: string;
  avatar_url: string | null;
};
type Provider = { profile_id: string; business_name: string | null; slug: string | null; status: string };
type Privacy = { profile_id: string; profile_visibility: string };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401, headers });

  const params = new URL(request.url).searchParams;
  const singleBookingId = params.get("booking");
  const batch = params.get("bookings");
  const bookingIds = [...new Set(singleBookingId ? [singleBookingId] : batch?.split(",") ?? [])];
  if (!bookingIds.length || bookingIds.length > 100 || bookingIds.some(id => !isUuid(id))) {
    return Response.json({ error: "invalid_booking" }, { status: 400, headers });
  }

  // First establish access through the caller's RLS session. Administrative
  // profile reads below are limited to identities derived from these rows.
  const { data: visibleRows, error } = await auth.client.from("bookings")
    .select("id,client_id,provider_id,starts_at,status")
    .in("id", bookingIds);
  if (error) return Response.json({ error: "unavailable" }, { status: 503, headers });

  const contexts = new Map((visibleRows ?? [])
    .filter(row => [row.client_id, row.provider_id].includes(auth.user.id))
    .map(row => [row.id, row as BookingContext]));
  if (contexts.size !== bookingIds.length && process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED === "true") {
    for (const bookingId of bookingIds) {
      if (contexts.has(bookingId)) continue;
      const result = await auth.client.rpc("get_staff_booking_context", { target_booking_id: bookingId });
      const staffRow = Array.isArray(result.data) ? result.data[0] as Omit<BookingContext, "id"> | undefined : undefined;
      if (!result.error && staffRow) contexts.set(bookingId, { ...staffRow, id: bookingId });
    }
  }
  if (contexts.size !== bookingIds.length) return Response.json({ error: "not_found" }, { status: 404, headers });

  const participants = bookingIds.map(id => {
    const booking = contexts.get(id)!;
    if (![booking.client_id, booking.provider_id].includes(auth.user.id)) {
      // Staff context is authorized by its RPC but only for the booking's client.
      return { booking, participantId: booking.client_id, isProvider: false };
    }
    const isClient = booking.client_id === auth.user.id;
    return { booking, participantId: isClient ? booking.provider_id : booking.client_id, isProvider: isClient };
  });

  const service = serviceSupabase();
  const participantIds = [...new Set(participants.map(item => item.participantId))];
  const clientProfileIds = participants.flatMap(item => {
    const profile = item.isProvider ? null : item.participantId;
    return profile ? [profile] : [];
  });
  const [profileResult, providerResult, privacyResult] = await Promise.all([
    service.from("profiles").select("id,display_name,first_name,last_name,username,role,avatar_url").in("id", participantIds),
    service.from("provider_profiles").select("profile_id,business_name,slug,status").in("profile_id", participantIds),
    clientProfileIds.length
      ? service.from("profile_privacy_settings").select("profile_id,profile_visibility").in("profile_id", clientProfileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileResult.error || providerResult.error || privacyResult.error) return Response.json({ error: "unavailable" }, { status: 503, headers });
  const profiles = new Map(((profileResult.data ?? []) as Profile[]).map(profile => [profile.id, profile]));
  const providers = new Map(((providerResult.data ?? []) as Provider[]).map(provider => [provider.profile_id, provider]));
  const privacy = new Map(((privacyResult.data ?? []) as Privacy[]).map(row => [row.profile_id, row.profile_visibility]));

  const rows = participants.map(({ booking, participantId }) => {
    const profile = profiles.get(participantId);
    const provider = providers.get(participantId);
    const name = provider?.business_name?.trim() || profile?.display_name?.trim()
      || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
      || (participantId === booking.provider_id ? "Professionnel" : "Client");
    let profilePath: string | null = null;
    if (provider?.status === "approved" && provider.slug) {
      profilePath = `/professional/${encodeURIComponent(provider.slug)}`;
    } else if (profile?.role === "client" && profile.username && privacy.get(participantId) === "public") {
      profilePath = `/u/${encodeURIComponent(profile.username)}`;
    }
    return {
      bookingId: booking.id,
      participantId,
      name,
      avatarUrl: profile?.avatar_url ?? null,
      startsAt: booking.starts_at,
      status: booking.status,
      ...(profilePath ? { profilePath } : {}),
    };
  });

  if (singleBookingId) return Response.json(rows[0], { headers });
  return Response.json({ bookings: rows }, { headers });
}
