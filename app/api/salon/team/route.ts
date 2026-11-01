import { createHash, randomBytes } from "node:crypto";
import { authenticatedSupabase, applicationOrigin, hasTrustedOrigin, jsonError } from "@/lib/payments/server";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const allowedPermissions = new Set(["bookings.read", "bookings.manage", "messages.read", "messages.reply", "services.read"]);
const roles = new Set(["manager", "reception", "member"]);
type InvitationAction =
  | { action: "invite"; businessId: string; email: string; role: string; permissions: string[] }
  | { action: "revoke_invitation"; businessId: string; invitationId: string }
  | { action: "update_access"; businessId: string; collaboratorId: string; role: string; permissions: string[] }
  | { action: "revoke_access"; businessId: string; collaboratorId: string };

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validPermissions(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= allowedPermissions.size
    && value.every((permission): permission is string => typeof permission === "string" && allowedPermissions.has(permission))
    && new Set(value).size === value.length
    && (!value.includes("bookings.manage") || value.includes("bookings.read"))
    && (!value.includes("messages.reply") || value.includes("messages.read"));
}
function validRole(value: unknown): value is string { return typeof value === "string" && roles.has(value); }
function parseAction(value: unknown): InvitationAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Record<string, unknown>;
  if (!validId(action.businessId)) return null;
  if (action.action === "invite" && typeof action.email === "string" && action.email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(action.email) && validRole(action.role) && validPermissions(action.permissions)) {
    return { action: "invite", businessId: action.businessId, email: action.email.trim().toLowerCase(), role: action.role, permissions: action.permissions };
  }
  if (action.action === "revoke_invitation" && validId(action.invitationId)) return { action: "revoke_invitation", businessId: action.businessId, invitationId: action.invitationId };
  if (action.action === "update_access" && validId(action.collaboratorId) && validRole(action.role) && validPermissions(action.permissions)) {
    return { action: "update_access", businessId: action.businessId, collaboratorId: action.collaboratorId, role: action.role, permissions: action.permissions };
  }
  if (action.action === "revoke_access" && validId(action.collaboratorId)) return { action: "revoke_access", businessId: action.businessId, collaboratorId: action.collaboratorId };
  return null;
}

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED !== "true") return jsonError("La gestion des accès d’équipe est temporairement désactivée.", 503, "team_access_disabled");
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
  const businessId = new URL(request.url).searchParams.get("businessId");
  if (!validId(businessId)) return jsonError("Salon invalide.", 400, "invalid_business");
  const [invitations, access, audit] = await Promise.all([
    auth.client.rpc("owner_list_business_invitations", { target_business_id: businessId }),
    auth.client.rpc("owner_list_collaborator_access", { target_business_id: businessId }),
    auth.client.rpc("owner_list_collaborator_audit", { target_business_id: businessId }),
  ]);
  if (invitations.error || access.error || audit.error) return jsonError("La gestion de l’équipe est indisponible.", 503, "team_unavailable");
  return Response.json({ invitations: invitations.data ?? [], access: access.data ?? [], audit: audit.data ?? [] }, { headers: noStore });
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED !== "true") return jsonError("La gestion des accès d’équipe est temporairement désactivée.", 503, "team_access_disabled");
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return jsonError("Requête trop volumineuse.", 413, "payload_too_large");
  let payload: unknown;
  try { payload = await request.json(); } catch { return jsonError("Requête invalide.", 400, "invalid_json"); }
  const action = parseAction(payload);
  if (!action) return jsonError("Vérifiez les informations et les permissions.", 400, "invalid_request");
  if (action.action === "revoke_invitation") {
    const { error } = await auth.client.rpc("revoke_business_invitation", { target_invitation_id: action.invitationId });
    if (error) return jsonError("L’invitation n’a pas pu être révoquée.", 409, "invitation_revoke_failed");
    return Response.json({ ok: true }, { headers: noStore });
  }
  if (action.action === "update_access") {
    const { error } = await auth.client.rpc("update_business_collaborator_access", { target_business_id: action.businessId, target_collaborator_id: action.collaboratorId, target_role: action.role, target_permissions: action.permissions });
    if (error) return jsonError("Les permissions n’ont pas pu être modifiées.", 409, "access_update_failed");
    return Response.json({ ok: true }, { headers: noStore });
  }
  if (action.action === "revoke_access") {
    const { error } = await auth.client.rpc("revoke_business_collaborator_access", { target_business_id: action.businessId, target_collaborator_id: action.collaboratorId });
    if (error) return jsonError("L’accès n’a pas pu être révoqué.", 409, "access_revoke_failed");
    return Response.json({ ok: true }, { headers: noStore });
  }

  const emailKey = process.env.RESEND_API_KEY;
  if (!emailKey) return jsonError("Le service d’invitation par e-mail n’est pas configuré.", 503, "email_unavailable");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const created = await auth.client.rpc("create_business_invitation", { target_business_id: action.businessId, target_email: action.email, target_role: action.role, target_permissions: action.permissions, target_token_hash: tokenHash });
  if (created.error || typeof created.data !== "string") return jsonError("L’invitation n’a pas pu être créée.", 409, "invitation_create_failed");
  const inviteUrl = new URL(`/salon/invitation/accept#token=${token}`, applicationOrigin(request)).toString();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${emailKey}`, "Content-Type": "application/json", "Idempotency-Key": `salon-invite-${created.data}` },
      body: JSON.stringify({ from: "MATA Beauty <bonjour@mata-beauty.com>", to: [action.email], subject: "Invitation à rejoindre une équipe MATA Beauty", text: `Vous avez reçu une invitation à rejoindre un salon sur MATA Beauty. Elle expire dans 48 heures.\n\nAccepter : ${inviteUrl}\n\nSi vous n’attendiez pas cette invitation, ignorez ce message.` }),
      signal: AbortSignal.timeout(8_000),
    });
    const result: unknown = await response.json();
    if (!response.ok || !result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string") throw new Error("delivery_failed");
  } catch {
    await auth.client.rpc("fail_business_invitation_delivery", { target_invitation_id: created.data });
    console.error("salon_invitation_delivery_failed");
    return jsonError("L’e-mail n’a pas pu être envoyé ; l’invitation a été annulée.", 503, "delivery_failed");
  }
  const sent = await auth.client.rpc("mark_business_invitation_sent", { target_invitation_id: created.data });
  if (sent.error) return jsonError("E-mail envoyé, mais son reçu n’a pas pu être enregistré. Vérifiez l’invitation avant tout nouvel envoi.", 503, "delivery_receipt_failed");
  return Response.json({ ok: true, invitationId: created.data }, { status: 201, headers: noStore });
}
