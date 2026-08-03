import { z } from "zod";
import { authenticatedSupabase, jsonError } from "@/lib/payments/server";

const schema = z.object({ paymentId: z.uuid(), amount: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) });

export async function POST(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Authentification requise.", 401, "UNAUTHENTICATED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Demande de remboursement invalide.", 400, "INVALID_REQUEST");
  const { data, error } = await auth.client.rpc("request_payment_refund", {
    target_payment_id: parsed.data.paymentId, target_amount: parsed.data.amount, target_reason: parsed.data.reason,
  });
  if (error || !data) return jsonError("La demande n’a pas pu être enregistrée.", 409, "REFUND_CREATE_FAILED");
  return Response.json({ ok: true, refund: data }, { status: 201 });
}
