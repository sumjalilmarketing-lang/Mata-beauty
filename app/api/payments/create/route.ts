import { randomUUID } from "node:crypto";
import { z } from "zod";
import { calculatePaymentQuote } from "@/lib/domain/payments";
import { getPaymentGateway } from "@/lib/payments/gateway";
import { authenticatedSupabase, consumeRateLimit, hasTrustedOrigin, jsonError, requestContext, requestFingerprint } from "@/lib/payments/server";

const schema = z.object({ bookingId: z.uuid(), method: z.enum(["orange_money", "wave", "card"]), attempt: z.string().min(8).max(80) });

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Origine de requête refusée.", 403, "UNTRUSTED_ORIGIN");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const context = requestContext(request);
  if (!await consumeRateLimit({ scope: "payment_create", key: `${auth.user.id}:${context.ipHash}`, limit: 8, windowSeconds: 60 })) {
    return jsonError("Trop de tentatives de paiement.", 429, "RATE_LIMITED");
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Demande de paiement invalide.", 400, "INVALID_REQUEST");
  const { data: booking } = await auth.client.from("bookings")
    .select("id,client_id,provider_id,total_amount,currency,provider_service_id,status")
    .eq("id", parsed.data.bookingId).eq("client_id", auth.user.id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable.", 404, "BOOKING_NOT_FOUND");
  if (booking.currency !== "XOF" || booking.status !== "pending") return jsonError("Cette réservation ne peut pas être payée.", 409, "BOOKING_NOT_PAYABLE");

  const quote = calculatePaymentQuote({ grossAmount: booking.total_amount, mode: "full", commission: { percentageBasisPoints: 1000, fixedAmount: 0 } });
  const reference = `MB-${randomUUID()}`;
  const fingerprint = requestFingerprint({ bookingId: booking.id, method: parsed.data.method, amount: quote.payableAmount, currency: "XOF" });
  const { data: payment, error } = await auth.client.rpc("initialize_payment_v2", {
    target_booking_id: booking.id, target_method: parsed.data.method, target_attempt: parsed.data.attempt,
    target_internal_reference: reference, target_request_fingerprint: fingerprint, target_source_ip_hash: context.ipHash,
  });
  if (error || !payment) return jsonError("Le paiement n’a pas pu être initialisé.", 409, "PAYMENT_CREATE_FAILED");
  const initialized = payment as { id: string; idempotent: boolean; provider_reference: string | null };
  if (initialized.idempotent) {
    return Response.json({ ok: true, payment, checkoutUrl: null, idempotent: true }, { headers: { "Cache-Control": "no-store", "X-Request-Id": context.requestId } });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    const gateway = getPaymentGateway();
    const session = await gateway.createCheckout({
      reference, amount: quote.payableAmount, currency: "XOF", description: `Réservation ${booking.id}`,
      method: parsed.data.method, successUrl: `${appUrl}/?payment=return`, cancelUrl: `${appUrl}/?payment=cancelled`,
      webhookUrl: `${appUrl}/api/payments/webhook`,
    });
    const { error: attachError } = await auth.client.rpc("attach_payment_provider", {
      target_payment_id: initialized.id, target_provider: session.provider,
      target_provider_reference: session.providerReference, target_is_test: session.isTest,
    });
    if (attachError) {
      await auth.client.rpc("fail_payment_initialization", { target_payment_id: initialized.id, target_failure_code: "PSP_ATTACH_FAILED", target_source_ip_hash: context.ipHash });
      return jsonError("La session PSP n’a pas pu être rattachée.", 503, "PSP_ATTACH_FAILED");
    }
    return Response.json({ ok: true, payment: { ...payment, provider: session.provider, provider_reference: session.providerReference }, checkoutUrl: session.checkoutUrl }, {
      status: 201, headers: { "Cache-Control": "no-store", "X-Request-Id": context.requestId },
    });
  } catch {
    await auth.client.rpc("fail_payment_initialization", { target_payment_id: initialized.id, target_failure_code: "PSP_UNAVAILABLE", target_source_ip_hash: context.ipHash });
    return jsonError("Le prestataire de paiement est momentanément indisponible. Aucun débit n’a été confirmé.", 503, "PSP_UNAVAILABLE");
  }
}
