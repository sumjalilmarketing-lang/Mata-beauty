import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getPaymentGateway, type GatewayConfirmation } from "@/lib/payments/gateway";
import { consumeRateLimit, jsonError, requestContext, serviceSupabase } from "@/lib/payments/server";
import { isWebhookFresh } from "@/lib/payments/security";

const mockEventSchema = z.object({
  eventId: z.string().min(1).max(200), providerReference: z.string().min(1).max(250),
  status: z.enum(["paid", "failed", "cancelled", "refunded"]), amount: z.number().int().nonnegative(),
  currency: z.literal("XOF"), occurredAt: z.iso.datetime().optional(),
});

const payDunyaSchema = z.object({
  hash: z.string().length(128), status: z.enum(["pending", "completed", "failed", "cancelled"]),
  invoice: z.object({ token: z.string().min(8), total_amount: z.coerce.number().int().nonnegative() }),
});

async function recordSuspicion(input: { requestId: string; type: string; severity: "warning" | "critical"; ipHash: string; payloadHash: string; details?: Record<string, unknown> }) {
  await serviceSupabase().from("financial_security_events").insert({
    request_id: input.requestId, event_type: input.type, severity: input.severity,
    source_ip_hash: input.ipHash, payload_hash_sha256: input.payloadHash, details: input.details ?? {},
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const context = requestContext(request);
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  if (rawBody.length > 128_000) return jsonError("Événement trop volumineux.", 413, "PAYLOAD_TOO_LARGE");
  let rateLimitAllowed = false;
  try {
    rateLimitAllowed = await consumeRateLimit({ scope: "payment_webhook", key: context.ipHash, limit: 120, windowSeconds: 60 });
  } catch {
    return jsonError("Le contrôle de sécurité est indisponible.", 503, "SECURITY_CONTROL_UNAVAILABLE");
  }
  if (!rateLimitAllowed) {
    await recordSuspicion({ requestId: context.requestId, type: "webhook.rate_limited", severity: "critical", ipHash: context.ipHash, payloadHash });
    return jsonError("Débit webhook dépassé.", 429, "RATE_LIMITED");
  }

  const gateway = getPaymentGateway();
  let eventId: string;
  let confirmation: GatewayConfirmation;
  let signature: string | null = request.headers.get("x-mata-signature");
  let occurredAt = new Date();

  try {
    if (gateway.provider === "paydunya") {
      const encoded = new URLSearchParams(rawBody).get("data");
      const parsed = payDunyaSchema.parse(JSON.parse(encoded ?? "null"));
      signature = parsed.hash;
      if (!gateway.verifyWebhook(rawBody, signature)) throw new Error("signature");
      confirmation = await gateway.confirmTransaction(parsed.invoice.token) as GatewayConfirmation;
      eventId = `paydunya:${parsed.invoice.token}:${confirmation.status}`;
    } else {
      if (!gateway.verifyWebhook(rawBody, signature)) throw new Error("signature");
      const parsed = mockEventSchema.parse(JSON.parse(rawBody));
      occurredAt = parsed.occurredAt ? new Date(parsed.occurredAt) : occurredAt;
      if (!isWebhookFresh(occurredAt)) throw new Error("replay");
      eventId = parsed.eventId;
      confirmation = { providerReference: parsed.providerReference, status: parsed.status === "refunded" ? "paid" : parsed.status, amount: parsed.amount, currency: parsed.currency };
      if (parsed.status === "refunded") confirmation = { ...confirmation, status: "paid" };
    }
  } catch (error) {
    const replay = error instanceof Error && error.message === "replay";
    await recordSuspicion({ requestId: context.requestId, type: replay ? "webhook.replay" : "webhook.invalid", severity: "critical", ipHash: context.ipHash, payloadHash });
    return jsonError(replay ? "Événement expiré." : "Webhook non authentique ou invalide.", 401, replay ? "REPLAY_DETECTED" : "INVALID_WEBHOOK");
  }

  const rawStatus = gateway.provider === "mock" ? mockEventSchema.parse(JSON.parse(rawBody)).status : confirmation.status;
  const targetStatus = rawStatus === "refunded" ? "refunded" : confirmation.status;
  const admin = serviceSupabase();
  const { data, error } = await admin.rpc("process_verified_payment_webhook", {
    target_provider: gateway.provider, target_provider_reference: confirmation.providerReference,
    target_event_id: eventId, target_status: targetStatus, target_amount: confirmation.amount,
    target_currency: confirmation.currency, target_payload_hash: payloadHash, target_source_ip_hash: context.ipHash,
    target_occurred_at: occurredAt.toISOString(), target_request_id: context.requestId || randomUUID(),
  });
  if (error) {
    await recordSuspicion({ requestId: context.requestId, type: "webhook.rejected", severity: "warning", ipHash: context.ipHash, payloadHash, details: { code: error.code } });
    return jsonError("Événement financier rejeté.", 409, "WEBHOOK_REJECTED");
  }
  return Response.json({ ok: true, outcome: data }, { headers: { "Cache-Control": "no-store", "X-Request-Id": context.requestId } });
}
