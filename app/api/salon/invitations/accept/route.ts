import { z } from "zod";
import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";
import { createHash } from "node:crypto";
import { authenticatedSupabase, hasTrustedOrigin, jsonError } from "@/lib/payments/server";

const input = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/) }).strict();

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED !== "true") return jsonError("Les invitations d’équipe sont temporairement désactivées.", 503, "invitation_disabled");
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Connectez-vous pour répondre à l’invitation.", 401, "unauthorized");
  let payload: unknown;
  try { payload = JSON.parse(await readBoundedText(request, 2048)); } catch (error) { return jsonError(error instanceof BodyTooLargeError ? "Requête trop volumineuse." : "Invitation invalide.", error instanceof BodyTooLargeError ? 413 : 400, error instanceof BodyTooLargeError ? "payload_too_large" : "invalid_json"); }
  const parsed = input.safeParse(payload);
  if (!parsed.success) return jsonError("Invitation invalide ou expirée.", 400, "invalid_invitation");
  const { token } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await auth.client.rpc("respond_business_invitation", { target_token_hash: tokenHash });
  if (error || !data || typeof data !== "object" || !["accepted", "pending_approval", "owner"].includes(data.state)) return jsonError("Vérifiez votre compte et la validité du lien, puis réessayez.", 409, "acceptance_failed");
  return Response.json({ ok: true, state: data.state, ...(data.state === "owner" ? { redirectTo: "/salon" } : data.state === "accepted" ? { redirectTo: "/staff" } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
}
