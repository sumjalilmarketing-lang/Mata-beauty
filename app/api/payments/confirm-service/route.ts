import { z } from "zod";
import { authenticatedSupabase, jsonError, serviceSupabase } from "@/lib/payments/server";

const schema = z.object({ bookingId: z.uuid() });

export async function POST(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Réservation invalide.", 400, "INVALID_REQUEST");
  const admin = serviceSupabase();
  const { data: booking } = await admin.from("bookings").select("id,client_id,provider_id,status").eq("id", parsed.data.bookingId).maybeSingle();
  if (!booking || ![booking.client_id, booking.provider_id].includes(auth.user.id)) return jsonError("Réservation introuvable.", 404, "BOOKING_NOT_FOUND");
  if (booking.status !== "completed") return jsonError("La prestation doit être terminée avant libération.", 409, "SERVICE_NOT_COMPLETED");
  const { error } = await admin.rpc("release_payment_funds", { target_booking_id: booking.id, target_actor_id: auth.user.id });
  if (error) return jsonError("Les fonds n’ont pas pu être libérés.", 409, "FUNDS_RELEASE_FAILED");
  return Response.json({ ok: true });
}
