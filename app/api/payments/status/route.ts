import { z } from "zod";
import { authenticatedSupabase, jsonError } from "@/lib/payments/server";

export async function GET(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const paymentId = z.uuid().safeParse(new URL(request.url).searchParams.get("paymentId"));
  if (!paymentId.success) return jsonError("Identifiant invalide.", 400, "INVALID_REQUEST");
  const { data, error } = await auth.client.from("payments")
    .select("id,booking_id,payment_status,payment_method,amount,currency,paid_at,refunded_amount,created_at")
    .eq("id", paymentId.data).maybeSingle();
  if (error || !data) return jsonError("Paiement introuvable.", 404, "PAYMENT_NOT_FOUND");
  return Response.json({ ok: true, payment: data });
}
