import { clientRescheduleInput, clientRescheduleQuery, clientRescheduleResult, clientRescheduleSlots } from "@/lib/domain/client-reschedule";
import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";
import { authenticatedSupabase, hasTrustedOrigin, jsonError } from "@/lib/payments/server";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function rejected(code: string | undefined) {
  if (code === "23P01" || code === "40001") return jsonError("Ce créneau n’est plus disponible. Actualisez les disponibilités.", 409, "slot_conflict");
  if (code === "42501" || code === "23514") return jsonError("Report indisponible : il nécessite plus de 48 h de préavis, un rendez-vous actif et aucun paiement engagé. Contactez le professionnel.", 403, "reschedule_not_allowed");
  return jsonError("Le report n’a pas pu être vérifié. Consultez vos rendez-vous avant de réessayer.", 503, "reschedule_unavailable");
}
export async function GET(request: Request) {
  try {
    const auth = await authenticatedSupabase(request);
    if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
    const query = new URL(request.url).searchParams;
    const parsed = clientRescheduleQuery.safeParse(Object.fromEntries(query));
    if (!parsed.success || [...query.keys()].length !== 2) return jsonError("Réservation ou date invalide.", 400, "invalid_request");
    const { data, error } = await auth.client.rpc("get_client_reschedule_slots", { target_booking_id: parsed.data.bookingId, target_date: parsed.data.date }).abortSignal(AbortSignal.timeout(15_000));
    if (error) return rejected(error.code);
    const slots = clientRescheduleSlots.safeParse(data);
    if (!slots.success) return rejected(undefined);
    return Response.json({ slots: slots.data }, { headers });
  } catch { return rejected(undefined); }
}
export async function POST(request: Request) {
  try {
    if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
    const auth = await authenticatedSupabase(request);
    if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
    let body: unknown;
    try { body = JSON.parse(await readBoundedText(request, 2048)); }
    catch (error) {
      return error instanceof BodyTooLargeError ? jsonError("Requête trop volumineuse.", 413, "payload_too_large") : jsonError("Requête invalide.", 400, "invalid_json");
    }
    const parsed = clientRescheduleInput.safeParse(body);
    if (!parsed.success) return jsonError("Réservation ou créneau invalide.", 400, "invalid_request");
    const { data, error } = await auth.client.rpc("reschedule_client_booking", { target_booking_id: parsed.data.bookingId, target_starts_at: parsed.data.startsAt }).abortSignal(AbortSignal.timeout(15_000));
    if (error) return rejected(error.code);
    const booking = clientRescheduleResult.safeParse(data);
    if (!booking.success || booking.data.id !== parsed.data.bookingId) return rejected(undefined);
    return Response.json({ ok: true, booking: booking.data }, { headers });
  } catch { return rejected(undefined); }
}
