import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { applicationOrigin, serviceSupabase } from "@/lib/payments/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const permissionKeys = ["bookings.read", "bookings.manage", "messages.read", "messages.reply", "services.read", "clients.read"] as const;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), businessId: z.uuid(), email: z.email().max(254), role: z.enum(["manager", "reception", "member"]), permissions: z.array(z.enum(permissionKeys)).min(1).max(permissionKeys.length) }),
  z.object({ action: z.literal("revoke_invitation"), invitationId: z.uuid() }),
  z.object({ action: z.literal("revoke_collaborator"), businessId: z.uuid(), collaboratorId: z.uuid() }),
  z.object({ action: z.literal("leave"), businessId: z.uuid() }),
]);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(applicationOrigin(request)).origin) return json({ error: "Origine refusée." }, 403);
  const client = await createSupabaseServerClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return json({ error: "Connexion requise." }, 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Vérifiez les informations et permissions." }, 400);
  const input = parsed.data;
  if (input.action === "revoke_invitation") {
    const result = await client.rpc("revoke_business_invitation", { target_invitation_id: input.invitationId });
    return result.error ? json({ error: "Révocation impossible." }, 403) : json({ ok: true });
  }
  if (input.action === "revoke_collaborator") {
    const result = await client.rpc("revoke_business_collaborator", { target_business_id: input.businessId, target_collaborator_id: input.collaboratorId });
    return result.error ? json({ error: "Révocation impossible." }, 403) : json({ ok: true });
  }
  if (input.action === "leave") {
    const result = await client.rpc("leave_business", { target_business_id: input.businessId });
    return result.error ? json({ error: "Impossible de quitter ce salon." }, 403) : json({ ok: true });
  }
  if (new Set(input.permissions).size !== input.permissions.length
    || (input.permissions.includes("bookings.manage") && !input.permissions.includes("bookings.read"))
    || (input.permissions.includes("messages.reply") && !input.permissions.includes("messages.read"))) return json({ error: "Dépendance de permission manquante." }, 400);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const prepared = await client.rpc("create_business_invitation", {
    target_business_id: input.businessId,
    target_email: input.email.trim().toLowerCase(),
    target_role: input.role,
    target_permissions: input.permissions,
    target_token_hash: tokenHash,
  });
  if (prepared.error || typeof prepared.data !== "string") return json({ error: "Invitation refusée. Vérifiez le propriétaire, le rôle et une éventuelle invitation déjà active." }, 409);
  const service = serviceSupabase();
  const invitation = await service.from("business_invitations").select("id,email,expires_at,businesses(name)").eq("id", prepared.data).single();
  if (invitation.error) { await client.rpc("revoke_business_invitation", { target_invitation_id: prepared.data }); return json({ error: "Invitation temporairement indisponible." }, 503); }
  const business = Array.isArray(invitation.data.businesses) ? invitation.data.businesses[0] : invitation.data.businesses;
  const acceptUrl = new URL("/salon/invitation/accept", applicationOrigin(request));
  acceptUrl.searchParams.set("token", rawToken);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`, "Content-Type": "application/json", "Idempotency-Key": `salon-invite-${prepared.data}` },
      body: JSON.stringify({
        from: "MATA Beauty <bonjour@mata-beauty.com>", to: [invitation.data.email],
        subject: "Invitation à rejoindre une équipe MATA Beauty",
        text: `Vous êtes invité(e) à rejoindre ${business?.name ?? "un salon MATA Beauty"}. Créez ou connectez-vous à votre compte avec cette adresse, puis acceptez l’invitation sous 48 heures : ${acceptUrl.toString()}`,
        html: `<h1>Invitation MATA Beauty</h1><p>Vous êtes invité(e) à rejoindre <strong>${escapeHtml(business?.name ?? "un salon MATA Beauty")}</strong>.</p><p>Utilisez l’adresse ${escapeHtml(invitation.data.email)} pour créer ou ouvrir votre compte, puis acceptez l’invitation sous 48 heures.</p><p><a href="${escapeHtml(acceptUrl.toString())}">Accepter l’invitation</a></p><p>Ce lien à usage unique expire le ${escapeHtml(new Date(invitation.data.expires_at).toLocaleString("fr-FR"))}.</p>`,
      }), signal: AbortSignal.timeout(10_000),
    });
    const receipt: unknown = await response.json();
    if (!response.ok || !receipt || typeof receipt !== "object" || !("id" in receipt) || typeof receipt.id !== "string") throw new Error("delivery_failed");
    const saved = await service.rpc("mark_business_invitation_sent", { target_invitation_id: prepared.data, target_provider_message_id: receipt.id });
    if (saved.error) throw new Error("delivery_receipt_failed");
  } catch {
    await client.rpc("revoke_business_invitation", { target_invitation_id: prepared.data });
    return json({ error: "E-mail non confirmé ; l’invitation a été révoquée. Réessayez plus tard." }, 503);
  }
  return json({ ok: true, invitationId: prepared.data });
}
