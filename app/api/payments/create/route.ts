import { randomUUID } from "node:crypto";
import { z } from "zod";
import { calculatePaymentQuote, makeIdempotencyKey } from "@/lib/domain/payments";
import { getPaymentGateway } from "@/lib/payments/gateway";
import { authenticatedSupabase, jsonError, serviceSupabase } from "@/lib/payments/server";

const schema = z.object({
  bookingId: z.uuid(),
  method: z.enum(["orange_money", "wave", "card"]),
  attempt: z.string().min(8).max(80),
});

export async function POST(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Demande de paiement invalide.", 400, "INVALID_REQUEST");
  const admin = serviceSupabase();
  const { data: booking } = await admin.from("bookings")
    .select("id,client_id,provider_id,total_amount,currency,provider_service_id,status")
    .eq("id", parsed.data.bookingId).eq("client_id", auth.user.id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable.", 404, "BOOKING_NOT_FOUND");
  if (booking.currency !== "XOF" || booking.status !== "pending") return jsonError("Cette réservation ne peut pas être payée.", 409, "BOOKING_NOT_PAYABLE");

  const quote = calculatePaymentQuote({ grossAmount: booking.total_amount, mode: "full", commission: { percentageBasisPoints: 1000, fixedAmount: 0 } });
  const key = makeIdempotencyKey({ userId: auth.user.id, bookingId: booking.id, amount: quote.payableAmount, attempt: parsed.data.attempt });
  const { data: existing } = await admin.from("payments").select("id,payment_status,provider_reference").eq("idempotency_key", key).maybeSingle();
  if (existing) return Response.json({ ok: true, payment: existing, idempotent: true });

  const reference = `MB-${randomUUID()}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const session = await getPaymentGateway().createCheckout({
    reference, amount: quote.payableAmount, currency: "XOF", description: `Réservation ${booking.id}`,
    method: parsed.data.method, successUrl: `${appUrl}/?payment=return`, cancelUrl: `${appUrl}/?payment=cancelled`,
    webhookUrl: `${appUrl}/api/payments/webhook`,
  });
  const { data: payment, error } = await admin.from("payments").insert({
    booking_id: booking.id, customer_id: auth.user.id, professional_id: booking.provider_id,
    payment_method: parsed.data.method, payment_status: "pending", amount: quote.payableAmount,
    gross_amount: quote.grossAmount, platform_fee: quote.platformFee, provider_fee: quote.providerFee,
    professional_net_amount: quote.professionalNetAmount, currency: quote.currency, provider: session.provider,
    provider_reference: session.providerReference, idempotency_key: key, is_test: true,
  }).select("id,payment_status,provider_reference").single();
  if (error || !payment) return jsonError("Le paiement n’a pas pu être initialisé.", 409, "PAYMENT_CREATE_FAILED");
  return Response.json({ ok: true, payment, checkoutUrl: session.checkoutUrl }, { status: 201 });
}
