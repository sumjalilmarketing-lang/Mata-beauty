import { z } from "zod";
import { authenticatedSupabase, consumeRateLimit, hasTrustedOrigin, jsonError, requestContext } from "@/lib/payments/server";

const schema = z.object({
  paymentId: z.uuid(), amount: z.number().int().positive(), reason: z.string().trim().min(3).max(1000),
  attempt: z.string().min(8).max(80),
});

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Origine de requête refusée.", 403, "UNTRUSTED_ORIGIN");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const context = requestContext(request);
  if (!await consumeRateLimit({ scope: "refund_request", key: `${auth.user.id}:${context.ipHash}`, limit: 5, windowSeconds: 300 })) {
    return jsonError("Trop de demandes de remboursement.", 429, "RATE_LIMITED");
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Demande de remboursement invalide.", 400, "INVALID_REQUEST");
  const { data, error } = await auth.client.rpc("request_payment_refund_v2", {
    target_payment_id: parsed.data.paymentId, target_amount: parsed.data.amount, target_reason: parsed.data.reason,
    target_attempt: parsed.data.attempt, target_source_ip_hash: context.ipHash,
  });
  if (error || !data) return jsonError("La demande n’a pas pu être enregistrée.", 409, "REFUND_CREATE_FAILED");
  return Response.json({ ok: true, refund: data }, { status: 201, headers: { "Cache-Control": "no-store", "X-Request-Id": context.requestId } });
}
