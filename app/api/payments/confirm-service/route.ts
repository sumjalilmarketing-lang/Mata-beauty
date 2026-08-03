import { z } from "zod";
import { authenticatedSupabase, jsonError } from "@/lib/payments/server";

const schema = z.object({ bookingId: z.uuid() });

export async function POST(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Réservation invalide.", 400, "INVALID_REQUEST");
  const { error } = await auth.client.rpc("confirm_service_and_release", { target_booking_id: parsed.data.bookingId });
  if (error) return jsonError("Les fonds n’ont pas pu être libérés.", 409, "FUNDS_RELEASE_FAILED");
  return Response.json({ ok: true });
}
