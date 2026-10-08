"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Member = { avatar_url: string | null; user_id: string; first_name: string | null; last_name: string | null; display_name: string; email: string; status: string; roles: string[]; mfa_enabled: boolean; created_at: string; last_sign_in_at: string | null };
type Role = { id: string; key: string; name: string };
type Invitation = { id: string; email: string; first_name: string; last_name: string; role_key: string; expires_at: string; sent_at: string | null; provider_message_id: string | null };
type Audit = { id: string; actor_id: string; action: string; entity_id: string; created_at: string };
type Team = { members: Member[]; roles: Role[]; permissions: { role_id: string; permission_key: string }[]; invitations: Invitation[]; audit: Audit[] };
type Change = { member: Member; action: "role" | "suspend" | "reactivate" | "revoke" };
const labels: Record<string, string> = { active: "Actif", pending: "Invitation en attente", suspended: "Suspendu", revoked: "Révoqué", role: "Modifier le rôle", suspend: "Suspendre l’accès", reactivate: "Réactiver", revoke: "Révoquer l’accès" };

export function InternalTeam({ matrixOnly = false }: { matrixOnly?: boolean }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [change, setChange] = useState<Change | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState("active");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/team", { cache: "no-store" });
      if (!response.ok) throw new Error("Chargement refusé ou indisponible. Vérifiez votre session et le MFA.");
      setTeam(await response.json() as Team);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement indisponible."); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!change) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled)") ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); setChange(null); }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener("keydown", onKeyDown);
    return () => { dialog?.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [change, busy]);
  async function send(values: Record<string, string>) {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/admin/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || "Action refusée.");
      setFeedback(values.action === "invite" || values.action === "resend" ? "Invitation envoyée." : "Accès mis à jour et action journalisée.");
      setInviting(false); setChange(null); await load();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Action indisponible."); }
    finally { setBusy(false); }
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void send({ action: "invite", firstName: String(data.get("firstName")), lastName: String(data.get("lastName")), email: String(data.get("email")), role: String(data.get("role")) });
  }
  if (!team) return <section className="admin-panel"><p role="status">{feedback || "Chargement de l’équipe…"}</p><button onClick={() => void load()}>Réessayer</button></section>;
  const roleName = (key: string) => team.roles.find(role => role.key === key)?.name ?? key;
  if (matrixOnly) return <section className="admin-panel"><h2>Matrice des permissions serveur</h2><p>Les permissions ci-dessous proviennent de la base. Aucune permission n’est attribuée depuis cette vue.</p><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Rôle</th><th>Permissions effectives</th></tr></thead><tbody>{team.roles.map(role => <tr key={role.key}><td>{role.name}</td><td>{team.permissions.filter(permission => permission.role_id === role.id).map(permission => permission.permission_key).join(", ")}</td></tr>)}</tbody></table></div></section>;
  return <section className="admin-panel internal-team">
    <h2>Équipe MATA Beauty</h2><button className="primary" onClick={() => setInviting(true)}>+ Inviter un membre</button>
    {feedback && <p role="status">{feedback}</p>}
    <div className="admin-filter-bar" aria-label="Statut des membres">{["active", "pending", "suspended", "revoked", "audit"].map(status => <button key={status} aria-pressed={tab === status} onClick={() => setTab(status)}>{status === "audit" ? "Journal d’activité" : labels[status]}</button>)}</div>
    {inviting && <form onSubmit={invite} className="dashboard-form"><h3>Inviter un membre</h3><p>Tous les champs sont obligatoires.</p><label>Prénom<input name="firstName" required maxLength={100} /></label><label>Nom<input name="lastName" required maxLength={100} /></label><label>E-mail professionnel<input name="email" type="email" required maxLength={254} /></label><label htmlFor="team-invitation-role">Rôle</label><select id="team-invitation-role" name="role" required>{team.roles.filter(role => role.key !== "super_admin").map(role => <option key={role.key} value={role.key}>{role.name}</option>)}</select><p>Le membre choisira son mot de passe et configurera le MFA. Aucun mot de passe ne sera communiqué au Super Admin.</p><button className="primary" disabled={busy}>{busy ? "Envoi…" : "Envoyer l’invitation"}</button><button type="button" disabled={busy} onClick={() => setInviting(false)}>Annuler</button></form>}
    {tab === "pending" ? team.invitations.map(invitation => <article className="admin-panel" key={invitation.id}><h3>{invitation.first_name} {invitation.last_name}</h3><p>{invitation.email} · {roleName(invitation.role_key)}</p><p>{invitation.provider_message_id ? "Envoi confirmé" : "Envoi non confirmé"} · Expire le {new Date(invitation.expires_at).toLocaleString("fr-FR")}</p><button disabled={busy} onClick={() => void send({ action: "resend", invitationId: invitation.id })}>Renvoyer l’invitation</button></article>) : tab === "audit" ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Date</th><th>Action</th><th>Acteur</th><th>Cible</th></tr></thead><tbody>{team.audit.map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString("fr-FR")}</td><td>{row.action}</td><td>{row.actor_id}</td><td>{row.entity_id}</td></tr>)}</tbody></table></div> : team.members.filter(member => member.status === tab).map(member => <article className="admin-panel" key={member.user_id}>{member.avatar_url && <Image src={member.avatar_url} alt="Photo du membre" width={48} height={48} unoptimized style={{ borderRadius: "50%", objectFit: "cover" }} />}<h3>{[member.first_name, member.last_name].filter(Boolean).join(" ") || member.display_name || "Membre"}</h3><p>{member.email}</p><p>{member.roles.map(roleName).join(", ")} · {labels[member.status]}</p><p>MFA : {member.mfa_enabled ? "Configuré" : "À configurer"}</p><p>Création : {new Date(member.created_at).toLocaleDateString("fr-FR")} · Dernière connexion : {member.last_sign_in_at ? new Date(member.last_sign_in_at).toLocaleString("fr-FR") : "Aucune"}</p><div className="admin-filter-bar">{(["role", ...(member.status === "active" ? ["suspend", "revoke"] : member.status === "suspended" ? ["reactivate", "revoke"] : [])] as Change["action"][]).map(action => <button disabled={busy} key={action} onClick={() => setChange({ member, action })}>{labels[action]}</button>)}</div></article>)}
    {change && <div className="modal-backdrop"><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="team-action-title"><h2 id="team-action-title">{labels[change.action]} ?</h2><p>{change.member.display_name || change.member.email}</p><form className="dashboard-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void send({ action: change.action, userId: change.member.user_id, reason: String(data.get("reason")), ...(change.action === "role" ? { role: String(data.get("role")) } : {}) }); }}>{change.action === "role" && <label>Nouveau rôle<select aria-label="Nouveau rôle" name="role" defaultValue={change.member.roles[0]}>{team.roles.map(role => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label>}<label>Justification (obligatoire)<textarea name="reason" required minLength={2} maxLength={1000} /></label><p>La modification prend effet sur les autorisations serveur immédiatement.</p><button disabled={busy} className="primary">{busy ? "Mise à jour…" : "Confirmer"}</button><button disabled={busy} type="button" onClick={() => setChange(null)}>Annuler</button></form></section></div>}
  </section>;
}
