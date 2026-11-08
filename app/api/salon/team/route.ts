import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";
import { normalizeInvitationPhone } from "@/lib/domain/salon-invitation-phone";
import { createHash, randomBytes } from "node:crypto";
import { authenticatedSupabase, applicationOrigin, hasTrustedOrigin, jsonError } from "@/lib/payments/server";
import { emailDeliveryLabel } from "@/lib/email/delivery-status";
import { salonInvitationEmail } from "@/lib/email/salon-invitation";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const allowedPermissions = new Set(["bookings.read", "bookings.manage", "messages.read", "messages.reply", "services.read"]);
const roles = new Set(["manager", "reception", "member"]);
type InvitationAction =
  | { action: "invite_phone"; businessId: string; phone: string; role: string; permissions: string[]; memberId: string | null }
  | { action: "review_phone"; businessId: string; claimId: string; approve: boolean }
  | { action: "invite" | "invite_link"; businessId: string; email: string; role: string; permissions: string[] }
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
  if (action.action === "invite_phone" && (action.memberId == null || validId(action.memberId)) && normalizeInvitationPhone(action.phone) && validRole(action.role) && validPermissions(action.permissions)) return { action: "invite_phone", businessId: action.businessId, phone: normalizeInvitationPhone(action.phone)!, memberId: typeof action.memberId === "string" ? action.memberId : null, role: action.role, permissions: action.permissions };
  if (action.action === "review_phone" && validId(action.claimId) && typeof action.approve === "boolean") return { action: "review_phone", businessId: action.businessId, claimId: action.claimId, approve: action.approve };
  if ((action.action === "invite" || action.action === "invite_link") && typeof action.email === "string" && action.email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(action.email) && validRole(action.role) && validPermissions(action.permissions)) {
    return { action: action.action, businessId: action.businessId, email: action.email.trim().toLowerCase(), role: action.role, permissions: action.permissions };
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
  const [invitations, access, audit, phoneInvitations] = await Promise.all([
    auth.client.rpc("owner_list_business_invitations", { target_business_id: businessId }),
    auth.client.rpc("owner_list_collaborator_access", { target_business_id: businessId }),
    auth.client.rpc("owner_list_collaborator_audit", { target_business_id: businessId }),
    auth.client.rpc("owner_list_business_phone_invitations", { target_business_id: businessId }),
  ]);
  if (invitations.error || access.error || audit.error || phoneInvitations.error) return jsonError("La gestion de l’équipe est indisponible.", 503, "team_unavailable");
  const invitationId = new URL(request.url).searchParams.get("invitationId");
  if (invitationId !== null) {
    if (!validId(invitationId)) return jsonError("Invitation invalide.", 400, "invalid_invitation");
    const rows = (audit.data ?? []) as { invitation_id: string; details: { resend_email_id?: unknown } }[];
    const receipt = rows.find(row => row.invitation_id === invitationId && validId(row.details?.resend_email_id));
    if (!receipt || !process.env.RESEND_API_KEY) return Response.json({ message: "Le suivi de cet ancien envoi est indisponible. Sa réception n’est pas confirmée." }, { headers: noStore });
    try {
      const response = await fetch(`https://api.resend.com/emails/${receipt.details.resend_email_id}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return jsonError("Le suivi de livraison est momentanément indisponible.", 503, "delivery_lookup_failed");
      const result = await response.json() as { last_event?: unknown; bounce?: { diagnosticCode?: unknown } };
      return Response.json({ message: emailDeliveryLabel(result.last_event, result.bounce) }, { headers: noStore });
    } catch { return jsonError("Le suivi de livraison est momentanément indisponible.", 503, "delivery_lookup_failed"); }
  }
  return Response.json({ invitations: [...(invitations.data ?? []).filter((row: { email: string | null }) => row.email !== null), ...(phoneInvitations.data ?? [])], access: access.data ?? [], audit: audit.data ?? [] }, { headers: noStore });
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED !== "true") return jsonError("La gestion des accès d’équipe est temporairement désactivée.", 503, "team_access_disabled");
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return jsonError("Requête trop volumineuse.", 413, "payload_too_large");
  let payload: unknown;
  try { payload = JSON.parse(await readBoundedText(request, 16384)); } catch (error) { if (error instanceof BodyTooLargeError) return jsonError("Requête trop volumineuse.", 413, "payload_too_large"); return jsonError("Requête invalide.", 400, "invalid_json"); }
  const action = parseAction(payload);
  if (!action) return jsonError("Vérifiez les informations et les permissions.", 400, "invalid_request");
  if (action.action === "review_phone") {
    const reviewed = await auth.client.rpc("review_business_phone_invitation", { target_claim_id: action.claimId, approve: action.approve });
    if (reviewed.error) return jsonError("La demande n’a pas pu être traitée. Actualisez l’équipe.", 409, "phone_review_failed");
    return Response.json({ ok: true }, { headers: noStore });
  }
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
  if (action.action === "invite" && !emailKey) return jsonError("Le service d’invitation par e-mail n’est pas configuré.", 503, "email_unavailable");
  // Check ownership before consulting any recipient-specific delivery state.
  const ownerCheck = await auth.client.rpc("owner_list_business_invitations", { target_business_id: action.businessId });
  if (ownerCheck.error) return jsonError("Accès au salon refusé.", 403, "invitation_owner_required");
  if (action.action === "invite") {
    try {
      const suppression = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(action.email)}`, {
        headers: { Authorization: `Bearer ${emailKey}` }, cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      if (suppression.ok) return jsonError("Cette adresse a été bloquée après un rejet ou un signalement. Vérifiez la boîte avec son titulaire avant tout nouvel envoi.", 409, "recipient_suppressed");
      if (suppression.status !== 404) return jsonError("La vérification du destinataire est indisponible. Aucun envoi effectué.", 503, "recipient_check_unavailable");
    } catch { return jsonError("La vérification du destinataire est indisponible. Aucun envoi effectué.", 503, "recipient_check_unavailable"); }
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const created = action.action === "invite_phone" ? await auth.client.rpc("create_member_phone_invitation", { target_member_id: action.memberId, target_business_id: action.businessId, target_phone: action.phone, target_role: action.role, target_permissions: action.permissions, target_token_hash: tokenHash }) : await auth.client.rpc("create_business_invitation", { target_business_id: action.businessId, target_email: action.email, target_role: action.role, target_permissions: action.permissions, target_token_hash: tokenHash });
  if (created.error || typeof created.data !== "string") return jsonError("L’invitation n’a pas pu être créée.", 409, "invitation_create_failed");
  const inviteUrl = new URL(`/salon/invitation/accept#token=${token}`, applicationOrigin(request)).toString();
  if (action.action === "invite_phone") return Response.json({ ok: true, invitationId: created.data, deliveryState: "whatsapp_ready", phone: action.phone, inviteUrl }, { status: 201, headers: noStore });
  if (action.action === "invite_link") {
    // Explicit owner-only sharing. No email, no fake delivery receipt, no role grant.
    // Acceptance still requires the invited, confirmed email and consumes the token.
    return Response.json({ ok: true, invitationId: created.data, deliveryState: "link_only", inviteUrl }, { status: 201, headers: noStore });
  }
  let providerMessageId = "";
  try {
    const business = await auth.client.from("businesses").select("name").eq("id", action.businessId).maybeSingle();
    const invitationEmail = salonInvitationEmail(inviteUrl, business.data?.name ?? "Une équipe");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${emailKey}`, "Content-Type": "application/json", "Idempotency-Key": `salon-invite-${created.data}` },
      body: JSON.stringify({ from: "MATA Beauty <bonjour@mata-beauty.com>", to: [action.email], ...invitationEmail }),
      signal: AbortSignal.timeout(8_000),
    });
    const result: unknown = await response.json();
    if (!response.ok || !result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string") throw new Error("delivery_failed");
    providerMessageId = result.id;
  } catch {
    await auth.client.rpc("fail_business_invitation_delivery", { target_invitation_id: created.data });
    console.error("salon_invitation_delivery_failed");
    return jsonError("L’e-mail n’a pas pu être envoyé ; l’invitation a été annulée.", 503, "delivery_failed");
  }
  const sent = await auth.client.rpc("mark_business_invitation_sent", { target_invitation_id: created.data });
  if (sent.error) return jsonError("E-mail envoyé, mais son reçu n’a pas pu être enregistré. Vérifiez l’invitation avant tout nouvel envoi.", 503, "delivery_receipt_failed");
  const receipt = await auth.client.rpc("record_business_invitation_receipt", { target_invitation_id: created.data, target_message_id: providerMessageId });
  // Never revoke a valid, already-sent invitation for a telemetry failure.
  console.info(JSON.stringify({ event: "salon_invitation_provider_accepted", invitationId: created.data, providerMessageId, receiptSaved: !receipt.error }));
  return Response.json({ ok: true, invitationId: created.data, deliveryState: "provider_accepted", inviteUrl }, { status: 201, headers: noStore });
}
