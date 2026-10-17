import { serviceSupabase } from "@/lib/payments/server";

const headers = {
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
  "X-Content-Type-Options": "nosniff",
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ApprovedProvider = { profile_id: string };
type ProfileLocation = { id: string; country_code: string | null };

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("ids")?.split(",") ?? [];
  const ids = [...new Set(requested.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 100 || ids.some((id) => !uuidPattern.test(id))) {
    return Response.json({ error: "invalid_provider_ids" }, { status: 400, headers });
  }

  try {
    const client = serviceSupabase();
    const { data: approvedData, error: approvedError } = await client.from("provider_profiles")
      .select("profile_id").eq("status", "approved").in("profile_id", ids).limit(100);
    if (approvedError) return Response.json({ error: "provider_locations_unavailable" }, { status: 503, headers });
    const approvedIds = ((approvedData ?? []) as ApprovedProvider[]).map((item) => item.profile_id);
    if (!approvedIds.length) return Response.json([], { headers });

    const { data: locationData, error: locationError } = await client.from("profiles")
      .select("id,country_code").in("id", approvedIds).limit(100);
    if (locationError) return Response.json({ error: "provider_locations_unavailable" }, { status: 503, headers });
    const approvedSet = new Set(approvedIds);
    const safeLocations = ((locationData ?? []) as ProfileLocation[])
      .filter((item) => approvedSet.has(item.id) && /^[A-Z]{2}$/.test(item.country_code ?? ""))
      .map((item) => ({ providerId: item.id, countryCode: item.country_code }));
    return Response.json(safeLocations, { headers });
  } catch {
    return Response.json({ error: "provider_locations_unavailable" }, { status: 503, headers });
  }
}
