import { createHash } from "node:crypto";
import { authenticatedSupabase, hasTrustedOrigin, jsonError } from "@/lib/payments/server";

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED !== "true") return jsonError("Les invitations d’équipe sont temporairement désactivées.", 503, "invitation_disabled");
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Connectez-vous avec l’adresse e-mail invitée.", 401, "unauthorized");
  let payload: unknown;
  try { payload = await request.json(); } catch { return jsonError("Invitation invalide.", 400, "invalid_json"); }
  const token = payload && typeof payload === "object" && "token" in payload ? (payload as { token?: unknown }).token : null;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return jsonError("Invitation invalide ou expirée.", 400, "invalid_invitation");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await auth.client.rpc("accept_business_invitation", { target_token_hash: tokenHash });
  if (error || typeof data !== "string") return jsonError("Vérifiez que vous êtes connecté avec l’adresse invitée et confirmée, puis réessayez.", 409, "acceptance_failed");
  return Response.json({ ok: true, redirectTo: "/staff" }, { headers: { "Cache-Control": "private, no-store" } });
}
