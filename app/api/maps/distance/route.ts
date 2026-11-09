import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";
import { limitMapsRequest } from "@/lib/maps-rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { distanceKm } from "@/lib/maps";

const point = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();
const inputSchema = z.object({ origin: point, destination: point }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = JSON.parse(await readBoundedText(request, 2048)); } catch (error) { return NextResponse.json({ error: error instanceof BodyTooLargeError ? "Requête trop volumineuse." : "Coordonnées invalides." }, { status: error instanceof BodyTooLargeError ? 413 : 400 }); }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Coordonnées invalides." }, { status: 400 });
  const fallback = distanceKm(parsed.data.origin, parsed.data.destination);
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ distanceKm: fallback, source: "haversine", configured: false });
  const limited = await limitMapsRequest(request);
  if (limited) return limited;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
      body: JSON.stringify({ origin: { location: { latLng: parsed.data.origin } }, destination: { location: { latLng: parsed.data.destination } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", languageCode: "fr-FR", units: "METRIC" }),
      signal: controller.signal, cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { routes?: Array<{ distanceMeters?: number; duration?: string }> } | null;
    const route = payload?.routes?.[0];
    if (!response.ok || !route?.distanceMeters) return NextResponse.json({ distanceKm: fallback, source: "haversine", configured: true });
    return NextResponse.json({ distanceKm: route.distanceMeters / 1000, duration: route.duration ?? null, source: "google_routes", configured: true });
  } catch { return NextResponse.json({ distanceKm: fallback, source: "haversine", configured: true }); }
  finally { clearTimeout(timeout); }
}
