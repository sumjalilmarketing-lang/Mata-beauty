import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applicationOrigin, serviceSupabase } from "@/lib/payments/server";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lookup"), email: z.email().max(254) }),
  z.object({ action: z.literal("invite"), email: z.email().max(254), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), role: z.string().min(1).max(50) }),
  z.object({ action: z.literal("resend"), invitationId: z.uuid() }),
  z.object({ action: z.literal("role"), userId: z.uuid(), role: z.string().min(1).max(50), reason: z.string().trim().min(2).max(1000) }),
  z.object({ action: z.enum(["suspend", "reactivate", "revoke"]), userId: z.uuid(), reason: z.string().trim().min(2).max(1000) }),
]);
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const accountRows = z.array(z.object({
  user_id: z.uuid(), email: z.email(), display_name: z.string().nullable(), is_suspended: z.boolean(),
}));
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

async function manager(request: Request) {
  const client = await createSupabaseServerClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  // This RPC independently enforces roles.manage, Super Admin and AAL2 in SQL.
  const members = await client.rpc("admin_list_team");
  if (members.error) return null;
  return { client, members: members.data, userId: data.user.id };
}

export async function GET(request: Request) {
  const auth = await manager(request);
  if (!auth) return reply({ error: "Accès Équipe & accès refusé. MFA requis." }, 403);
  const [roles, permissions, invitations, audit] = await Promise.all([
    auth.client.from("admin_roles").select("key,name,id").eq("is_active", true),
    auth.client.from("admin_role_permissions").select("role_id,permission_key"),
    auth.client.from("internal_invitations").select("id,email,first_name,last_name,role_key,status,created_at,sent_at,expires_at,provider_message_id").eq("status", "pending").order("created_at", { ascending: false }),
    auth.client.from("audit_logs").select("id,actor_id,action,entity_id,created_at,after_data").or("action.like.team.%,action.eq.admin.role_assigned").order("created_at", { ascending: false }).limit(100),
  ]);
  if ([roles, permissions, invitations, audit].some(result => result.error)) return reply({ error: "Chargement de l’équipe indisponible." }, 503);
  return reply({ members: auth.members, roles: roles.data, permissions: permissions.data, invitations: invitations.data, audit: audit.data });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(applicationOrigin(request)).origin) return reply({ error: "Origine refusée." }, 403);
  const auth = await manager(request);
  if (!auth) return reply({ error: "Accès Équipe & accès refusé. MFA requis." }, 403);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Vérifiez les informations saisies." }, 400);
  const values = parsed.data;
  if (values.action === "lookup") {
    // The team-manager gate above independently requires Super Admin + AAL2.
    // Search results remain server-side; expose only an exact, active match.
    const result = await auth.client.rpc("admin_list_users", { search_term: values.email });
    if (result.error) return reply({ error: "Recherche de compte indisponible." }, 503);
    const rows = accountRows.safeParse(result.data);
    if (!rows.success) return reply({ error: "Recherche de compte indisponible." }, 503);
    const matches = rows.data.filter(row => row.email.toLowerCase() === values.email.toLowerCase());
    const candidate = matches.length === 1 ? matches[0] : null;
    if (!candidate || candidate.is_suspended || candidate.user_id === auth.userId) {
      return reply({ error: "Aucun autre compte actif ne correspond exactement à cette adresse." }, 404);
    }
    return reply({ candidate: { userId: candidate.user_id, email: candidate.email, displayName: candidate.display_name ?? candidate.email } });
  }
  if (values.action === "role") {
    const result = await auth.client.rpc("admin_assign_role", { target_user_id: values.userId, target_role_key: values.role, reason: values.reason });
    return result.error ? reply({ error: "Changement de rôle refusé." }, 403) : reply({ ok: true });
  }
  if (values.action !== "invite" && values.action !== "resend") {
    const result = await auth.client.rpc("admin_change_internal_access", { target_user_id: values.userId, target_action: values.action, reason: values.reason });
    return result.error ? reply({ error: "Modification d’accès refusée. Vérifiez le statut du membre." }, 403) : reply({ ok: true });
  }
  if (!process.env.RESEND_API_KEY) return reply({ error: "Service d’envoi indisponible." }, 503);
  let invitationId: string;
  if (values.action === "invite") {
    const prepared = await auth.client.rpc("admin_prepare_invitation", { target_email: values.email, given_name: values.firstName, family_name: values.lastName, target_role_key: values.role });
    if (prepared.error || typeof prepared.data !== "string") return reply({ error: "Invitation refusée : vérifiez le rôle et l’absence de compte ou d’invitation existante." }, 409);
    invitationId = prepared.data;
  } else {
    const prepared = await auth.client.rpc("admin_resend_invitation", { target_invitation_id: values.invitationId });
    if (prepared.error) return reply({ error: "Renvoi refusé : invitation non disponible ou dernier envoi trop récent." }, 409);
    invitationId = values.invitationId;
  }
  try {
    const service = serviceSupabase();
    const invitation = await service.from("internal_invitations").select("*").eq("id", invitationId).single();
    if (invitation.error) throw new Error("invitation_read_failed");
    const row = invitation.data;
    const generated = await service.auth.admin.generateLink({ type: "invite", email: row.email, options: { redirectTo: `${applicationOrigin(request)}/auth/confirm`, data: { first_name: row.first_name, last_name: row.last_name, display_name: `${row.first_name} ${row.last_name}` } } });
    if (generated.error) throw new Error("invitation_link_failed");
    const bound = await auth.client.rpc("admin_bind_invitation", { target_invitation_id: invitationId, target_user_id: generated.data.user.id });
    if (bound.error) throw new Error("invitation_bind_failed");
    const role = await auth.client.from("admin_roles").select("name").eq("key", row.role_key).single();
    if (role.error) throw new Error("invitation_role_failed");
    const link = `${applicationOrigin(request)}/auth/confirm?type=invite&token_hash=${encodeURIComponent(generated.data.properties.hashed_token)}`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `team-invite-${invitationId}-${row.delivery_version}` },
      body: JSON.stringify({ from: "MATA Beauty <bonjour@mata-beauty.com>", to: [row.email], subject: "MATA Beauty vous invite à rejoindre son équipe", text: `Bonjour ${row.first_name} ${row.last_name},\n\nMATA Beauty vous invite à rejoindre son équipe.\nRôle : ${role.data.name}\n\nActiver mon accès : ${link}\n\nCe lien est à usage unique. Activez votre accès dans les 24 heures ; s’il a expiré, demandez un nouvel envoi. Vous choisirez votre mot de passe, puis configurerez le MFA avant d’accéder à votre espace.\n\nMATA Beauty`, html: `<h1>MATA Beauty vous invite à rejoindre son équipe</h1><p>Bonjour ${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)},</p><p>Rôle attribué : <strong>${escapeHtml(role.data.name)}</strong></p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;background:#570b43;color:white;border-radius:8px;text-decoration:none">Activer mon accès</a></p><p>Choisissez votre mot de passe, puis configurez le MFA. Activez votre accès sous 24 heures. Le lien est à usage unique ; en cas d’expiration, demandez un nouvel envoi à votre Super Admin.</p>` }),
      signal: AbortSignal.timeout(10_000),
    });
    const receipt: unknown = await response.json();
    if (!response.ok || !receipt || typeof receipt !== "object" || !("id" in receipt) || typeof receipt.id !== "string") throw new Error("invitation_delivery_failed");
    const saved = await service.from("internal_invitations").update({ sent_at: new Date().toISOString(), provider_message_id: receipt.id }).eq("id", invitationId);
    if (saved.error) throw new Error("invitation_receipt_failed");
    return reply({ ok: true });
  } catch {
    return reply({ error: "L’envoi n’a pas pu être confirmé. L’invitation reste en attente ; vérifiez son état avant de la renvoyer." }, 503);
  }
}
