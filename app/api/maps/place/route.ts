import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ placeId: z.string().trim().min(5).max(300), sessionToken: z.string().uuid().optional() });

export async function GET(request: Request) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ error: "Google Maps n’est pas configuré." }, { status: 503 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ placeId: url.searchParams.get("placeId"), sessionToken: url.searchParams.get("sessionToken") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Adresse invalide." }, { status: 400 });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(parsed.data.placeId)}?languageCode=fr&regionCode=SN${parsed.data.sessionToken ? `&sessionToken=${parsed.data.sessionToken}` : ""}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents" }, signal: controller.signal, cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { id?: string; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; addressComponents?: Array<{ longText?: string; types?: string[] }> } | null;
    if (!response.ok || !payload?.id || payload.location?.latitude === undefined || payload.location.longitude === undefined) return NextResponse.json({ error: "Cette adresse ne peut pas être localisée." }, { status: 422 });
    const component = (type: string) => payload.addressComponents?.find((item) => item.types?.includes(type))?.longText ?? "";
    return NextResponse.json({ placeId: payload.id, formattedAddress: payload.formattedAddress ?? "", latitude: payload.location.latitude, longitude: payload.location.longitude, city: component("locality") || component("administrative_area_level_1") || "Dakar", area: component("sublocality") || component("sublocality_level_1") || component("neighborhood") });
  } catch { return NextResponse.json({ error: "Validation de l’adresse interrompue." }, { status: 504 }); }
  finally { clearTimeout(timeout); }
}

