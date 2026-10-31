import { serviceSupabase } from "@/lib/payments/server";

const headers = {
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
  "X-Content-Type-Options": "nosniff",
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ApprovedProvider = { profile_id: string; country_code: string | null };

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("ids")?.split(",") ?? [];
  const ids = [...new Set(requested.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 100 || ids.some((id) => !uuidPattern.test(id))) {
    return Response.json({ error: "invalid_provider_ids" }, { status: 400, headers });
  }

  try {
    const client = serviceSupabase();
    const { data: approvedData, error: approvedError } = await client.from("provider_profiles")
      .select("profile_id,country_code").eq("status", "approved").in("profile_id", ids).limit(100);
    // Legacy production has no establishment country yet. Omit it rather than
    // publishing the owner's private country of residence as a business location.
    if (approvedError?.code === "42703") return Response.json([], { headers });
    if (approvedError) return Response.json({ error: "provider_locations_unavailable" }, { status: 503, headers });
    const requestedIds = new Set(ids);
    const safeLocations = ((approvedData ?? []) as ApprovedProvider[])
      .filter((item) => requestedIds.has(item.profile_id) && /^[A-Z]{2}$/.test(item.country_code ?? ""))
      .map((item) => ({ providerId: item.profile_id, countryCode: item.country_code }));
    return Response.json(safeLocations, { headers });
  } catch {
    return Response.json({ error: "provider_locations_unavailable" }, { status: 503, headers });
  }
}
