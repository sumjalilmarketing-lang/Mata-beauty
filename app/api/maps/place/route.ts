import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ placeId: z.string().trim().min(5).max(300), sessionToken: z.string().uuid().optional(), languageCode: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/).optional() });

export async function GET(request: Request) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ error: "Google Maps n’est pas configuré." }, { status: 503 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ placeId: url.searchParams.get("placeId"), sessionToken: url.searchParams.get("sessionToken") ?? undefined, languageCode: url.searchParams.get("languageCode") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Adresse invalide." }, { status: 400 });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const parameters = new URLSearchParams({ languageCode: parsed.data.languageCode ?? "fr" });
    if (parsed.data.sessionToken) parameters.set("sessionToken", parsed.data.sessionToken);
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(parsed.data.placeId)}?${parameters.toString()}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents" }, signal: controller.signal, cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { id?: string; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }> } | null;
    if (!response.ok || !payload?.id || payload.location?.latitude === undefined || payload.location.longitude === undefined) return NextResponse.json({ error: "Cette adresse ne peut pas être localisée." }, { status: 422 });
    const component = (type: string, short = false) => {
      const value = payload.addressComponents?.find((item) => item.types?.includes(type));
      return short ? value?.shortText ?? value?.longText ?? "" : value?.longText ?? "";
    };
    return NextResponse.json({ placeId: payload.id, formattedAddress: payload.formattedAddress ?? "", latitude: payload.location.latitude, longitude: payload.location.longitude, city: component("locality") || component("postal_town") || component("administrative_area_level_1"), area: component("sublocality") || component("sublocality_level_1") || component("neighborhood"), countryCode: component("country", true).toUpperCase(), region: component("administrative_area_level_1") });
  } catch { return NextResponse.json({ error: "Validation de l’adresse interrompue." }, { status: 504 }); }
  finally { clearTimeout(timeout); }
}

