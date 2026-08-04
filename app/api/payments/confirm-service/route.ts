import { z } from "zod";
import { authenticatedSupabase, consumeRateLimit, hasTrustedOrigin, jsonError, requestContext } from "@/lib/payments/server";

const schema = z.object({ bookingId: z.uuid() });

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Origine de requête refusée.", 403, "UNTRUSTED_ORIGIN");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const context = requestContext(request);
  let rateLimitAllowed = false;
  try {
    rateLimitAllowed = await consumeRateLimit({ scope: "service_release", key: `${auth.user.id}:${context.ipHash}`, limit: 6, windowSeconds: 60 });
  } catch {
    return jsonError("Le contrôle de sécurité est indisponible.", 503, "SECURITY_CONTROL_UNAVAILABLE");
  }
  if (!rateLimitAllowed) {
    return jsonError("Trop de tentatives de libération.", 429, "RATE_LIMITED");
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Réservation invalide.", 400, "INVALID_REQUEST");
  const { error } = await auth.client.rpc("confirm_service_and_release", { target_booking_id: parsed.data.bookingId });
  if (error) return jsonError("Les fonds n’ont pas pu être libérés.", 409, "FUNDS_RELEASE_FAILED");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "X-Request-Id": context.requestId } });
}
