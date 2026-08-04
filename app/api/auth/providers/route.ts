import { jsonError } from "@/lib/payments/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return jsonError("Configuration Auth indisponible.", 503, "AUTH_CONFIGURATION_MISSING");
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey, "X-Client-Info": "mata-beauty-oauth-check" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return jsonError("Configuration Auth indisponible.", 503, "AUTH_PROVIDER_CHECK_FAILED");
    const payload = await response.json() as { external?: { google?: boolean } };
    return Response.json({ google: payload.external?.google === true }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return jsonError("Configuration Auth indisponible.", 503, "AUTH_PROVIDER_CHECK_FAILED");
  }
}
