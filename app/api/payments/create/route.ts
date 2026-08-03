import { randomUUID } from "node:crypto";
import { z } from "zod";
import { calculatePaymentQuote } from "@/lib/domain/payments";
import { getPaymentGateway } from "@/lib/payments/gateway";
import { authenticatedSupabase, jsonError } from "@/lib/payments/server";

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
  const { data: booking } = await auth.client.from("bookings")
    .select("id,client_id,provider_id,total_amount,currency,provider_service_id,status")
    .eq("id", parsed.data.bookingId).eq("client_id", auth.user.id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable.", 404, "BOOKING_NOT_FOUND");
  if (booking.currency !== "XOF" || booking.status !== "pending") return jsonError("Cette réservation ne peut pas être payée.", 409, "BOOKING_NOT_PAYABLE");

  const quote = calculatePaymentQuote({ grossAmount: booking.total_amount, mode: "full", commission: { percentageBasisPoints: 1000, fixedAmount: 0 } });
  const reference = `MB-${randomUUID()}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const session = await getPaymentGateway().createCheckout({
    reference, amount: quote.payableAmount, currency: "XOF", description: `Réservation ${booking.id}`,
    method: parsed.data.method, successUrl: `${appUrl}/?payment=return`, cancelUrl: `${appUrl}/?payment=cancelled`,
    webhookUrl: `${appUrl}/api/payments/webhook`,
  });
  const { data: payment, error } = await auth.client.rpc("initialize_payment", {
    target_booking_id: booking.id, target_method: parsed.data.method,
    target_attempt: parsed.data.attempt, target_provider_reference: session.providerReference,
  });
  if (error || !payment) return jsonError("Le paiement n’a pas pu être initialisé.", 409, "PAYMENT_CREATE_FAILED");
  return Response.json({ ok: true, payment, checkoutUrl: session.checkoutUrl }, { status: 201 });
}
