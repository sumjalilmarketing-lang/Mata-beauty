import { z } from "zod";
import { authenticatedSupabase, jsonError, serviceSupabase } from "@/lib/payments/server";

const schema = z.object({ paymentId: z.uuid(), amount: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) });

export async function POST(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Demande de remboursement invalide.", 400, "INVALID_REQUEST");
  const admin = serviceSupabase();
  const { data: payment } = await admin.from("payments")
    .select("id,booking_id,customer_id,amount,refunded_amount,payment_status")
    .eq("id", parsed.data.paymentId).eq("customer_id", auth.user.id).maybeSingle();
  if (!payment) return jsonError("Paiement introuvable.", 404, "PAYMENT_NOT_FOUND");
  if (!["paid", "held", "available", "partially_refunded"].includes(payment.payment_status)) {
    return jsonError("Ce paiement n’est pas remboursable.", 409, "PAYMENT_NOT_REFUNDABLE");
  }
  if (parsed.data.amount > payment.amount - payment.refunded_amount) return jsonError("Montant supérieur au solde remboursable.", 409, "REFUND_AMOUNT_EXCEEDED");
  const { data, error } = await admin.from("refunds").insert({
    payment_id: payment.id, booking_id: payment.booking_id, requested_by: auth.user.id,
    amount: parsed.data.amount, reason: parsed.data.reason, status: "requested",
  }).select("id,status,amount,created_at").single();
  if (error || !data) return jsonError("La demande n’a pas pu être enregistrée.", 409, "REFUND_CREATE_FAILED");
  return Response.json({ ok: true, refund: data }, { status: 201 });
}
