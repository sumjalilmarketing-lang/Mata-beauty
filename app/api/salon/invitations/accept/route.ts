import { createHash } from "node:crypto";
import { z } from "zod";
import { applicationOrigin, serviceSupabase } from "@/lib/payments/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({ token: z.string().min(40).max(100) });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(applicationOrigin(request)).origin) return json({ error: "Origine refusée." }, 403);
  const client = await createSupabaseServerClient(request);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || !auth.user.email_confirmed_at || !auth.user.email) return json({ error: "Connectez ou créez un compte vérifié avec l’adresse invitée." }, 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Jeton d’invitation invalide." }, 400);
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const service = serviceSupabase();
  const invitation = await service.rpc("lookup_business_invitation", { target_token_hash: tokenHash });
  const invitationRows = Array.isArray(invitation.data) ? invitation.data : [];
  const candidate = invitationRows[0];
  const invitationData = candidate && typeof candidate === "object"
    && "id" in candidate && typeof candidate.id === "string"
    && "email" in candidate && typeof candidate.email === "string"
    && "expires_at" in candidate && typeof candidate.expires_at === "string"
    && "status" in candidate && typeof candidate.status === "string"
    ? { id: candidate.id, email: candidate.email, expires_at: candidate.expires_at, status: candidate.status }
    : null;
  if (invitation.error || !invitationData || invitationData.status !== "pending" || new Date(invitationData.expires_at).getTime() <= Date.now()) return json({ error: "Invitation invalide ou expirée. Demandez un nouvel envoi au responsable." }, 410);
  if (invitationData.email !== auth.user.email.toLowerCase()) return json({ error: "Connectez-vous avec l’adresse e-mail qui a reçu cette invitation." }, 403);
  const accepted = await service.rpc("accept_business_invitation", { target_invitation_id: invitationData.id, target_token_hash: tokenHash, target_user_id: auth.user.id });
  if (accepted.error || !accepted.data || typeof accepted.data !== "object") return json({ error: "L’invitation a déjà été utilisée ou ne peut plus être acceptée." }, 409);
  return json({ ok: true, membership: accepted.data });
}
