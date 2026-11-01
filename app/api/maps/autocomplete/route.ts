import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ input: z.string().trim().min(3).max(180), sessionToken: z.string().uuid().optional(), countryCode: z.string().regex(/^[A-Za-z]{2}$/).optional(), languageCode: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/).optional() });

export async function GET(request: Request) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ suggestions: [], configured: false }, { status: 503 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ input: url.searchParams.get("input"), sessionToken: url.searchParams.get("sessionToken") ?? undefined, countryCode: url.searchParams.get("countryCode") ?? undefined, languageCode: url.searchParams.get("languageCode") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Recherche d’adresse invalide." }, { status: 400 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" },
      body: JSON.stringify({ input: parsed.data.input, ...(parsed.data.countryCode ? { includedRegionCodes: [parsed.data.countryCode.toLowerCase()] } : {}), languageCode: parsed.data.languageCode ?? "fr", ...(parsed.data.countryCode ? { regionCode: parsed.data.countryCode.toUpperCase() } : {}), sessionToken: parsed.data.sessionToken }),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }> } | null;
    if (!response.ok) return NextResponse.json({ error: "Google Places est momentanément indisponible." }, { status: 502 });
    const suggestions = (payload?.suggestions ?? []).flatMap(({ placePrediction }) => placePrediction?.placeId ? [{ placeId: placePrediction.placeId, primaryText: placePrediction.structuredFormat?.mainText?.text ?? placePrediction.text?.text ?? "Adresse", secondaryText: placePrediction.structuredFormat?.secondaryText?.text ?? "", fullText: placePrediction.text?.text ?? "" }] : []);
    return NextResponse.json({ suggestions, configured: true });
  } catch {
    return NextResponse.json({ error: "Recherche d’adresse interrompue." }, { status: 504 });
  } finally { clearTimeout(timeout); }
}

