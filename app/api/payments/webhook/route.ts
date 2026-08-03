import { z } from "zod";
import { canTransitionPayment, type PaymentStatus } from "@/lib/domain/payments";
import { getPaymentGateway } from "@/lib/payments/gateway";
import { jsonError, serviceSupabase } from "@/lib/payments/server";

const eventSchema = z.object({
  eventId: z.string().min(1).max(200),
  providerReference: z.string().min(1).max(250),
  status: z.enum(["paid", "failed", "cancelled", "refunded"]),
  amount: z.number().int().nonnegative(), currency: z.literal("XOF"),
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!getPaymentGateway().verifyWebhook(rawBody, request.headers.get("x-mata-signature"))) {
    return jsonError("Signature webhook invalide.", 401, "INVALID_SIGNATURE");
  }
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return jsonError("Événement invalide.", 400, "INVALID_EVENT"); }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return jsonError("Événement invalide.", 400, "INVALID_EVENT");
  const admin = serviceSupabase();
  const { data: payment } = await admin.from("payments").select("id,payment_status,amount,currency").eq("provider_reference", parsed.data.providerReference).maybeSingle();
  if (!payment) return jsonError("Transaction inconnue.", 404, "PAYMENT_NOT_FOUND");
  const { data: duplicate } = await admin.from("payment_events").select("id").eq("provider_event_id", parsed.data.eventId).maybeSingle();
  if (duplicate) return Response.json({ ok: true, duplicate: true });
  if (payment.amount !== parsed.data.amount || payment.currency !== parsed.data.currency) return jsonError("Montant ou devise incohérent.", 409, "PAYMENT_MISMATCH");
  if (!canTransitionPayment(payment.payment_status as PaymentStatus, parsed.data.status)) return jsonError("Transition de statut interdite.", 409, "INVALID_TRANSITION");
  const { error } = await admin.rpc("process_payment_webhook", {
    target_payment_id: payment.id, target_event_id: parsed.data.eventId,
    target_status: parsed.data.status, target_payload: parsed.data,
  });
  if (error) return jsonError("Événement non traité.", 409, "WEBHOOK_REJECTED");
  return Response.json({ ok: true });
}
