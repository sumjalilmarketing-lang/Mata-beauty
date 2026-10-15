"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Member = { id: string; display_name: string; first_name: string | null; public_last_name: string | null; title: string | null; avatar_url: string | null; specialties: string[]; buffer_minutes: number; is_active: boolean; is_bookable: boolean; archived_at: string | null };
type Service = { id: string; title: string; business_id: string | null };
type Qualification = { collaborator_id: string; provider_service_id: string };
type Hours = { id: string; collaborator_id: string; weekday: number; starts_at: string; ends_at: string };
type Absence = { id: string; collaborator_id: string; starts_at: string; ends_at: string; kind: string; reason: string | null };
type Appointment = { id: string; starts_at: string; ends_at: string; status: string; collaborator_id: string | null; collaborator_name: string | null; client_name: string; service_title: string; assignment_conflict: boolean };
type Candidate = { id: string; display_name: string; avatar_url: string | null };
type Assignment = { id: string; collaborator_name: string | null; reason: string | null; created_at: string };
type TeamAccess = { collaborator_id: string; profile_id: string; display_name: string; email: string | null; internal_role: string; permissions: string[]; revoked_at: string | null };
type TeamInvitation = { id: string; email: string; internal_role: string; status: string; expires_at: string; created_at: string; accepted_at: string | null; sent_at: string | null };
type TeamAudit = { id: string; invitation_id: string | null; collaborator_id: string | null; actor_id: string | null; event_type: string; details: Record<string, unknown>; created_at: string };
const permissionChoices = [
  ["bookings.read", "Voir les rendez-vous"], ["bookings.manage", "Gérer les rendez-vous"],
  ["messages.read", "Voir les conversations"], ["messages.reply", "Répondre aux conversations"],
  ["services.read", "Voir les prestations"],
] as const;
function normalizePermissions(values: string[]) {
  const unique = new Set(values);
  if (unique.has("bookings.manage")) unique.add("bookings.read");
  if (unique.has("messages.reply")) unique.add("messages.read");
  return [...unique];
}
const weekdays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const statusNames: Record<string, string> = { pending: "En attente", confirmed: "Confirmé", in_progress: "En cours", completed: "Terminé", declined: "Refusé", cancelled_by_client: "Annulé par le client", cancelled_by_provider: "Annulé par le salon", no_show: "Absence", disputed: "Litige" };
const api = () => { const client = getSupabaseBrowserClient(); if (!client) throw new Error("Connexion indisponible"); return client; };
const time = (value: string) => new Date(value).toLocaleTimeString("fr-FR", { timeZone: "Africa/Dakar", hour: "2-digit", minute: "2-digit" });
async function requestTeamApi<T>(businessId: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<T> {
  const client = api(); const { data } = await client.auth.getSession();
  if (!data.session?.access_token) throw new Error("Reconnectez-vous pour gérer les accès.");
  const response = await fetch(method === "GET" ? `/api/salon/team?businessId=${encodeURIComponent(businessId)}` : "/api/salon/team", {
    method, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store",
  });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(response.status === 503 ? "Le service d’invitation n’est pas disponible. Vérifiez la configuration e-mail." : "Action refusée ou informations invalides.");
  return result as T;
}

export function ProviderTeamAgenda({ userId }: { userId: string }) {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void api().from("businesses").select("id").eq("owner_id", userId).is("archived_at", null).order("created_at").limit(1).maybeSingle().then(result => {
      if (active) { setError(Boolean(result.error)); setBusinessId(result.data?.id ?? null); }
    });
    return () => { active = false; };
  }, [userId]);
  if (error) return <p role="alert">L’agenda d’équipe n’a pas pu être chargé.</p>;
  return businessId ? <TeamAgenda businessId={businessId} /> : null;
}

type StaffAppointment = { id: string; starts_at: string; ends_at: string; status: string; service_title: string; client_name: string };
type StaffService = { id: string; title: string; description: string | null; duration_minutes: number; price_amount: number; currency: string; is_active: boolean };
export function StaffServices() {
  const [services, setServices] = useState<StaffService[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void Promise.resolve(api().rpc("get_staff_services")).then(({ data, error }) => {
      if (!active) return;
      setServices(error ? [] : (data ?? []) as StaffService[]);
      setLoading(false);
    }).catch(() => { if (active) { setServices([]); setLoading(false); } });
    return () => { active = false; };
  }, []);
  return <section className="workspace-content"><h2>Prestations autorisées</h2>{loading ? <p role="status">Chargement…</p> : services.length ? <div className="workspace-list">{services.map((service) => <article key={service.id}><strong>{service.title}</strong><small>{service.duration_minutes} min · {formatStaffPrice(service.price_amount, service.currency)} · {service.is_active ? "Active" : "Inactive"}</small>{service.description && <p>{service.description}</p>}</article>)}</div> : <p>Aucune prestation du salon ne vous est attribuée.</p>}</section>;
}

function formatStaffPrice(amount: number, currency: string) {
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${amount.toLocaleString("fr-FR")} ${currency}`; }
}

export function StaffAgenda({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<StaffAppointment[]>([]);
  const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dakar" }).format(new Date()));
  const [loading, setLoading] = useState(true), [busyId, setBusyId] = useState<string | null>(null), [feedback, setFeedback] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const result = await api().rpc("get_staff_booking_agenda", { from_date: date, days: 7 });
    if (result.error) { setFeedback("Les rendez-vous autorisés n’ont pas pu être chargés."); setRows([]); }
    else { setFeedback(""); setRows((result.data ?? []) as StaffAppointment[]); }
    setLoading(false);
  }, [date]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function transition(row: StaffAppointment, status: string) {
    if (busyId) return;
    setBusyId(row.id); setFeedback("");
    const result = await api().rpc("staff_update_booking_status", { target_booking_id: row.id, target_status: status });
    if (result.error) setFeedback("Cette transition n’est plus autorisée. Actualisez la liste.");
    else { setFeedback("Rendez-vous mis à jour."); await load(); }
    setBusyId(null);
  }
  return <section className="workspace-content"><div className="workspace-intro"><div><span>Espace collaborateur</span><h2>Mes rendez-vous</h2><p>Seuls les rendez-vous attribués à votre compte sont affichés.</p></div></div>
    {feedback && <p role="status">{feedback}</p>}<article className="workspace-panel salon-panel"><label>Semaine à partir du<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      {loading && <p role="status">Chargement des rendez-vous…</p>}{!loading && rows.length === 0 && <p>Aucun rendez-vous attribué pour cette période.</p>}
      <div className="salon-list">{rows.map(row => <div key={row.id}><div><strong>{row.service_title}</strong><small>{row.client_name} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(row.starts_at))} · {statusNames[row.status] ?? row.status}</small></div>
        {canManage && row.status === "pending" && <><button disabled={busyId === row.id} onClick={() => void transition(row, "confirmed")}>Confirmer</button><button disabled={busyId === row.id} onClick={() => void transition(row, "declined")}>Refuser</button></>}
        {canManage && row.status === "confirmed" && <button disabled={busyId === row.id} onClick={() => void transition(row, "in_progress")}>Démarrer</button>}
        {canManage && row.status === "in_progress" && <button disabled={busyId === row.id} onClick={() => void transition(row, "completed")}>Terminer</button>}
      </div>)}</div>
    </article></section>;
}

export function TeamManagement({ businessId, ownerId, collaboratorAccessEnabled = false }: { businessId: string; ownerId: string; collaboratorAccessEnabled?: boolean }) {
  const [members, setMembers] = useState<Member[]>([]), [services, setServices] = useState<Service[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]), [hours, setHours] = useState<Hours[]>([]), [absences, setAbsences] = useState<Absence[]>([]);
  const [selected, setSelected] = useState<Member | null>(null), [editing, setEditing] = useState(false);
  const [staffAccess, setStaffAccess] = useState<TeamAccess[]>([]), [invitations, setInvitations] = useState<TeamInvitation[]>([]), [audit, setAudit] = useState<TeamAudit[]>([]);
  const [enabled, setEnabled] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const savedMemberId = useRef<string | null>(null);
  const [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    const client = api();
    const [people, offers, business, accessResult] = await Promise.all([
      client.from("collaborators").select("id,display_name,first_name,public_last_name,title,avatar_url,specialties,buffer_minutes,is_active,is_bookable,archived_at").eq("business_id", businessId).order("display_name"),
      client.from("provider_services").select("id,title,business_id").eq("provider_id", ownerId).is("archived_at", null),
      client.from("businesses").select("team_booking_enabled").eq("id", businessId).single(),
      collaboratorAccessEnabled ? requestTeamApi<{ access: TeamAccess[]; invitations: TeamInvitation[]; audit: TeamAudit[] }>(businessId, "GET") : Promise.resolve({ access: [], invitations: [], audit: [] }),
    ]);
    for (const result of [people, offers, business]) if (result.error) throw result.error;
    setStaffAccess(accessResult.access); setInvitations(accessResult.invitations); setAudit(accessResult.audit);
    const next = (people.data ?? []) as Member[];
    setMembers(next); setServices(((offers.data ?? []) as Service[]).filter(s => !s.business_id || s.business_id === businessId)); setEnabled(Boolean(business.data?.team_booking_enabled));
    if (next.length) {
      const ids = next.map(m => m.id);
      const [skills, windows, exceptions] = await Promise.all([
        client.from("collaborator_services").select("collaborator_id,provider_service_id").in("collaborator_id", ids),
        client.from("collaborator_hours").select("id,collaborator_id,weekday,starts_at,ends_at").in("collaborator_id", ids).order("weekday").order("starts_at"),
        client.from("collaborator_exceptions").select("id,collaborator_id,starts_at,ends_at,kind,reason").in("collaborator_id", ids).order("starts_at"),
      ]);
      for (const result of [skills, windows, exceptions]) if (result.error) throw result.error;
      setQualifications((skills.data ?? []) as Qualification[]); setHours((windows.data ?? []) as Hours[]); setAbsences((exceptions.data ?? []) as Absence[]);
      setSelected(current => current ? next.find(m => m.id === current.id) ?? null : null);
    }
    setLoading(false);
  }, [businessId, ownerId, collaboratorAccessEnabled]);
  useEffect(() => { const timer = window.setTimeout(() => { void load().catch(error => { setMessage(publicErrorMessage(error, "Chargement de l’équipe impossible.")); setLoading(false); }); }, 0); return () => window.clearTimeout(timer); }, [load]);
  async function mutate(action: () => Promise<void>, success: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setMessage("");
    try { await action(); await load(); setRevision(v => v + 1); setMessage(success); }
    catch (error) { setMessage(publicErrorMessage(error, "La modification n’a pas pu être enregistrée.")); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const file = form.get("photo");
    if (file instanceof File && file.size && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024)) {
      setMessage("Photo JPEG, PNG ou WebP, 12 Mo maximum."); return;
    }
    await mutate(async () => {
      const result = await api().rpc("save_team_member", { target_business_id: businessId, target_member_id: selected?.id ?? savedMemberId.current, member: {
        first_name: String(form.get("first_name") ?? ""), public_last_name: String(form.get("last_name") ?? ""), title: String(form.get("title") ?? ""),
        specialties: String(form.get("specialties") ?? "").split(",").map(s => s.trim()).filter(Boolean), buffer_minutes: Number(form.get("buffer")), is_bookable: form.get("bookable") === "on",
      }, service_ids: form.getAll("service") });
      if (result.error) throw result.error;
      savedMemberId.current = result.data as string;
      if (file instanceof File && file.size) {
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${businessId}/employee-${result.data}-${crypto.randomUUID()}.${extension}`;
        const upload = await api().storage.from("business-media").upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
        const update = await api().from("collaborators").update({ avatar_url: api().storage.from("business-media").getPublicUrl(path).data.publicUrl }).eq("id", result.data as string);
        if (update.error) { await api().storage.from("business-media").remove([path]); throw update.error; }
      }
      savedMemberId.current = null; setEditing(false);
    }, "Fiche enregistrée. Vérifiez ses horaires et les rendez-vous existants ci-dessous.");
  }
  async function calendar(event: FormEvent<HTMLFormElement>, exception: boolean) {
    event.preventDefault(); if (!selected) return; const formElement = event.currentTarget, values = new FormData(formElement);
    await mutate(async () => {
      const payload: Record<string, string | number> = exception ? { collaborator_id: selected.id, starts_at: `${values.get("starts")}Z`, ends_at: `${values.get("ends")}Z`, kind: String(values.get("kind")), reason: String(values.get("reason") ?? "") }
        : { collaborator_id: selected.id, weekday: Number(values.get("weekday")), starts_at: String(values.get("starts")), ends_at: String(values.get("ends")), slot_interval_minutes: 30 };
      const result = await api().from(exception ? "collaborator_exceptions" : "collaborator_hours").insert(payload);
      if (result.error) throw result.error; formElement.reset();
    }, "Disponibilités enregistrées. Les éventuels rendez-vous à réaffecter sont signalés dans l’agenda.");
  }
  if (loading) return <p role="status">Chargement de l’équipe…</p>;
  return <div className="team-management">
    <header><h2>Mon équipe</h2><p>Les fiches d’équipe gèrent les prestations et les horaires. Les accès de compte sont séparés et limités aux permissions attribuées côté serveur. Les horaires sont affichés à l’heure du Sénégal.</p></header>
    {message && <p className="salon-feedback" role="status">{message}</p>}
    {!collaboratorAccessEnabled && <p className="salon-feedback" role="status">Les invitations, rôles de compte et permissions sont désactivés jusqu’à validation et application de la migration de sécurité.</p>}
    {collaboratorAccessEnabled && <><article className="workspace-panel salon-panel"><h3>Inviter un collaborateur</h3><p>Le lien est à usage unique, envoyé à l’adresse indiquée et expire après 48 heures.</p>
      <form className="salon-form" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const permissions = normalizePermissions(values.getAll("permission").map(String)); void mutate(async () => {
        await requestTeamApi(businessId, "POST", { action: "invite", businessId, email: String(values.get("email") ?? ""), role: String(values.get("role") ?? "member"), permissions }); form.reset();
      }, "Invitation envoyée. Elle apparaîtra comme acceptée après validation par le collaborateur."); }}>
        <label>E-mail<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
        <label>Rôle<select name="role" defaultValue="member"><option value="member">Membre</option><option value="reception">Accueil</option><option value="manager">Responsable d’équipe</option></select></label>
        <fieldset className="wide"><legend>Permissions de cette invitation</legend>{permissionChoices.map(([key, label]) => <label className="check" key={key}><input type="checkbox" name="permission" value={key} defaultChecked={["bookings.read", "messages.read", "messages.reply"].includes(key)} />{label}</label>)}</fieldset>
        <button className="salon-primary" disabled={busy}>Envoyer l’invitation</button>
      </form>
    </article>
    <article className="workspace-panel salon-panel"><h3>Invitations et accès</h3>
      <div className="salon-list">{invitations.map(invite => <div key={invite.id}><div><strong>{invite.email}</strong><small>{invite.internal_role} · {invite.status === "pending" ? `Expire le ${new Date(invite.expires_at).toLocaleString("fr-FR")}` : invite.status === "accepted" ? `Acceptée le ${invite.accepted_at ? new Date(invite.accepted_at).toLocaleDateString("fr-FR") : "—"}` : invite.status}</small></div>{invite.status === "pending" && <button disabled={busy} onClick={() => void mutate(async () => { await requestTeamApi(businessId, "POST", { action: "revoke_invitation", businessId, invitationId: invite.id }); }, "Invitation révoquée.")}>Révoquer</button>}</div>)}{!invitations.length && <p>Aucune invitation pour le moment.</p>}</div>
      <h4>Comptes associés</h4><div className="team-cards">{staffAccess.map(account => <article className="workspace-panel salon-panel" key={account.collaborator_id}><h5>{account.display_name}</h5><p>{account.email || "Adresse non disponible"} · {account.internal_role} · {account.revoked_at ? "Accès révoqué" : "Accès actif"}</p>
        <form className="salon-form" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); const permissions = normalizePermissions(values.getAll("permission").map(String)); const role = String(values.get("role") ?? account.internal_role); void mutate(async () => { await requestTeamApi(businessId, "POST", { action: "update_access", businessId, collaboratorId: account.collaborator_id, role, permissions }); }, "Rôle et permissions mis à jour."); }}>
          <label>Rôle<select name="role" defaultValue={account.internal_role}><option value="member">Membre</option><option value="reception">Accueil</option><option value="manager">Responsable d’équipe</option></select></label>
          <fieldset className="wide"><legend>Permissions individuelles</legend>{permissionChoices.map(([key,label]) => <label className="check" key={key}><input type="checkbox" name="permission" value={key} defaultChecked={account.permissions.includes(key)} />{label}</label>)}</fieldset>
        <button disabled={busy}>Enregistrer les permissions</button>{!account.revoked_at && <button type="button" className="danger" disabled={busy} onClick={() => { if (window.confirm(`Révoquer l’accès de ${account.display_name} ? Les fiches et rendez-vous restent conservés.`)) void mutate(async () => { await requestTeamApi(businessId, "POST", { action: "revoke_access", businessId, collaboratorId: account.collaborator_id }); }, "Accès révoqué immédiatement. Les fiches et l’historique sont conservés."); }}>Révoquer l’accès</button>}
        </form>
      </article>)}</div>{!staffAccess.length && <p>Aucun compte associé pour l’instant.</p>}
    </article>
    <details className="workspace-panel salon-panel"><summary>Historique des accès ({audit.length})</summary><div className="salon-list">{audit.map(item => <div key={item.id}><div><strong>{item.event_type.replaceAll("_", " ")}</strong><small>{new Date(item.created_at).toLocaleString("fr-FR")} · {String(item.details.role ?? "")}</small></div></div>)}{!audit.length && <p>Aucune action enregistrée.</p>}</div></details></>}
    <div className="team-toolbar"><button disabled={busy} className="salon-primary" onClick={() => { savedMemberId.current = null; setSelected(null); setEditing(true); }}>Ajouter un employé</button>
      <button disabled={busy} onClick={() => void mutate(async () => { const result = await api().rpc("set_team_booking_enabled", { target_business_id: businessId, enabled: !enabled }); if (result.error) throw result.error; }, enabled ? "Réservation par équipe désactivée." : "Réservation par équipe activée.")}>{enabled ? "Désactiver la réservation par équipe" : "Activer la réservation par équipe"}</button></div>
    {!enabled && <p>Configurez les prestations et les horaires avant d’activer le choix d’un collaborateur. Les indépendants peuvent conserver leur réservation habituelle.</p>}
    <div className="team-cards">{members.map(person => <article className="workspace-panel salon-panel" key={person.id}>
      {person.avatar_url && <Image unoptimized src={person.avatar_url} alt={`Photo de ${person.display_name}`} width={64} height={64} />}
      <h3>{person.display_name}</h3><p>{person.title}</p><p>{person.specialties.join(" · ")}</p><p>{person.archived_at ? "Archivé" : !person.is_active ? "Inactif" : person.is_bookable ? "Réservable selon ses horaires" : "Non réservable"}</p>
      {!person.archived_at && <div className="team-toolbar"><button disabled={busy} onClick={() => { setSelected(person); setEditing(true); }}>Modifier la fiche</button><button disabled={busy} onClick={() => { setSelected(person); setEditing(false); }}>Horaires et absences</button>
        <button disabled={busy} onClick={() => void mutate(async () => { const r = await api().from("collaborators").update({ is_active: !person.is_active }).eq("id", person.id); if (r.error) throw r.error; }, "Disponibilité mise à jour.")}>{person.is_active ? "Désactiver" : "Réactiver"}</button>
        <button disabled={busy} onClick={() => { if (window.confirm(`Archiver ${person.display_name} ? Son historique est conservé. Vérifiez ensuite les rendez-vous à réaffecter.`)) void mutate(async () => { const r = await api().from("collaborators").update({ is_active: false, is_bookable: false, archived_at: new Date().toISOString() }).eq("id", person.id); if (r.error) throw r.error; }, "Collaborateur archivé, historique conservé."); }}>Archiver</button></div>}
    </article>)}</div>
    {editing && <article className="workspace-panel salon-panel"><h3>{selected ? `Modifier ${selected.display_name}` : "Nouvel employé"}</h3><form key={selected?.id ?? "new"} className="salon-form" onSubmit={save}>
      <label>Prénom<input name="first_name" required maxLength={50} defaultValue={selected?.first_name ?? selected?.display_name ?? ""} /></label><label>Nom public<input name="last_name" maxLength={49} defaultValue={selected?.public_last_name ?? ""} /></label>
      <label>Fonction<input name="title" maxLength={100} defaultValue={selected?.title ?? ""} /></label><label>Photo professionnelle<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <label className="wide">Spécialités, séparées par des virgules<input name="specialties" maxLength={2000} defaultValue={selected?.specialties.join(", ") ?? ""} /></label>
      <fieldset className="wide"><legend>Prestations autorisées</legend>{services.map(service => <label className="check" key={service.id}><input name="service" value={service.id} type="checkbox" defaultChecked={qualifications.some(q => q.collaborator_id === selected?.id && q.provider_service_id === service.id)} />{service.title}</label>)}{!services.length && <p>Ajoutez d’abord une prestation à votre catalogue.</p>}</fieldset>
      <label>Pause après une prestation (minutes)<input name="buffer" type="number" min={0} max={120} defaultValue={selected?.buffer_minutes ?? 0} required /></label><label className="check"><input type="checkbox" name="bookable" defaultChecked={selected?.is_bookable ?? true} />Réservable</label>
      <button className="salon-primary" disabled={busy}>Enregistrer la fiche</button><button type="button" onClick={() => setEditing(false)}>Fermer</button>
    </form></article>}
    {selected && !editing && !selected.archived_at && <article className="workspace-panel salon-panel"><h3>Horaires et absences — {selected.display_name}</h3><p>Un jour sans plage horaire est un jour de repos. Ajoutez plusieurs plages pour prévoir une pause.</p>
      <form className="salon-form" onSubmit={event => void calendar(event, false)}><label>Jour<select name="weekday">{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Début<input name="starts" type="time" required /></label><label>Fin<input name="ends" type="time" required /></label><button disabled={busy}>Ajouter une plage</button></form>
      {hours.filter(h => h.collaborator_id === selected.id).map(h => <div className="team-toolbar" key={h.id}><span>{weekdays[h.weekday]} : {h.starts_at.slice(0, 5)}–{h.ends_at.slice(0, 5)}</span><button disabled={busy} onClick={() => void mutate(async () => { const r = await api().from("collaborator_hours").delete().eq("id", h.id); if (r.error) throw r.error; }, "Plage retirée.")}>Retirer la plage</button></div>)}
      <h4>Absence ou horaires particuliers</h4><form className="salon-form" onSubmit={event => void calendar(event, true)}><label>Type<select name="kind"><option value="leave">Congé</option><option value="rest">Repos</option><option value="absence">Absence exceptionnelle</option><option value="hours">Horaires particuliers de la journée</option></select></label><label>Motif<input name="reason" maxLength={240} /></label><label>Du<input name="starts" type="datetime-local" required /></label><label>Au<input name="ends" type="datetime-local" required /></label><button disabled={busy}>Enregistrer l’exception</button></form>
      {absences.filter(a => a.collaborator_id === selected.id).map(a => <div className="team-toolbar" key={a.id}><span>{a.starts_at.slice(0, 10)} {time(a.starts_at)} → {a.ends_at.slice(0, 10)} {time(a.ends_at)} · {a.reason || (a.kind === "hours" ? "Horaires particuliers" : "Indisponibilité")}</span><button disabled={busy} onClick={() => void mutate(async () => { const r = await api().from("collaborator_exceptions").delete().eq("id", a.id); if (r.error) throw r.error; }, "Exception retirée.")}>Retirer l’exception</button></div>)}
    </article>}
    <TeamAgenda businessId={businessId} revision={revision} />
  </div>;
}

export function TeamAgenda({ businessId, revision = 0 }: { businessId: string; revision?: number }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)), [filter, setFilter] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [rows, setRows] = useState<Appointment[]>([]), [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null), [candidates, setCandidates] = useState<Candidate[]>([]), [history, setHistory] = useState<Assignment[]>([]), [busy, setBusy] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => { const r = await api().rpc("get_team_agenda", { target_business_id: businessId, from_date: date, days: 7 }); if (r.error) throw r.error; setRows((r.data ?? []) as Appointment[]); setCurrentTime(Date.now()); }, [businessId, date]);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(error => setMessage(publicErrorMessage(error, "Agenda indisponible."))), 0); return () => window.clearTimeout(timer); }, [load, revision]);
  useEffect(() => { const timer = window.setInterval(() => setCurrentTime(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const canReassign = (row: Appointment, at = currentTime) => ["pending", "confirmed"].includes(row.status) && Date.parse(row.starts_at) > at;
  async function open(row: Appointment, forReassignment: boolean) {
    setSelected(null); setMessage("");
    try { const [choices, changes] = await Promise.all([forReassignment && canReassign(row) ? api().rpc("get_reassignment_candidates", { target_booking_id: row.id }) : Promise.resolve(null), api().from("booking_assignments").select("id,collaborator_name,reason,created_at").eq("booking_id", row.id).order("created_at")]);
      if (choices?.error) throw choices.error; if (changes.error) throw changes.error;
      setCandidates((choices?.data ?? []) as Candidate[]); setHistory((changes.data ?? []) as Assignment[]); setReassigning(forReassignment && canReassign(row)); setSelected(row);
    } catch (error) { setMessage(publicErrorMessage(error, forReassignment ? "Les possibilités de réaffectation ne sont pas disponibles." : "L’historique n’a pas pu être chargé.")); }
  }
  async function reassign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !reassigning || !canReassign(selected, Date.now()) || lock.current) return; const values = new FormData(event.currentTarget);
    if (!window.confirm("Confirmer la réaffectation ? Le client sera informé.")) return;
    lock.current = true; setBusy(true);
    try { const r = await api().rpc("reassign_booking_collaborator", { target_booking_id: selected.id, target_collaborator_id: values.get("employee"), reason: values.get("reason") }); if (r.error) throw r.error; await load(); setSelected(null); setMessage("Réaffectation enregistrée. Notification créée pour le client."); }
    catch (error) { setMessage(publicErrorMessage(error, "Réaffectation impossible. Actualisez les disponibilités.")); }
    finally { lock.current = false; setBusy(false); }
  }
  const people = [...new Map(rows.map(row => [row.collaborator_id ?? "pending", row.collaborator_name ?? "À affecter"])).entries()];
  return <article className="workspace-panel salon-panel"><h2>Agenda par collaborateur</h2><p>Semaine à partir de la date choisie · heure du Sénégal.</p>
    <div className="salon-form"><label>Début de semaine<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>Employé<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Tous</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button onClick={() => void load().catch(error => setMessage(publicErrorMessage(error, "Actualisation impossible.")))}>Actualiser</button></div>
    {message && <p role="status">{message}</p>}
    <div className="team-cards">{people.filter(([id]) => !filter || filter === id).map(([id, name]) => <section key={id}><h3>{name}</h3>{rows.filter(row => (row.collaborator_id ?? "pending") === id).map(row => <article className="team-appointment" key={row.id} id={`booking-${row.id}`}>
      <strong>{row.client_name} · {row.service_title}</strong><p>{row.starts_at.slice(0, 10)} · {time(row.starts_at)}–{time(row.ends_at)} · {Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000)} min</p><p>{statusNames[row.status] ?? row.status}</p>
      {row.assignment_conflict && <p role="alert">Indisponibilité : réaffectation à prévoir. Contactez le client pour convenir d’un autre créneau si nécessaire.</p>}
      <button onClick={() => void open(row, false)}>Voir l’historique</button>
      {canReassign(row) && <button onClick={() => void open(row, true)}>Réaffecter</button>}
    </article>)}</section>)}</div>
    {!rows.length && <p>Aucun rendez-vous pour cette semaine.</p>}
    {selected && <section aria-label="Historique du rendez-vous"><h3>{reassigning ? "Réaffecter" : "Historique"} — {selected.service_title}</h3>{reassigning && canReassign(selected) && <form className="salon-form" onSubmit={reassign}><label>Collaborateur disponible<select required name="employee" defaultValue=""><option value="" disabled>Choisir</option>{candidates.filter(c => c.id !== selected.collaborator_id).map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label><label>Motif<input name="reason" required minLength={3} maxLength={240} /></label><button disabled={busy || !candidates.some(c => c.id !== selected.collaborator_id)}>Confirmer la réaffectation</button></form>}<h4>Historique des affectations</h4>{history.map(item => <p key={item.id}>{item.created_at.slice(0, 10)} · {item.collaborator_name} · {item.reason || "Affectation initiale"}</p>)}{!history.length && <p>Aucune affectation enregistrée.</p>}<button type="button" onClick={() => setSelected(null)}>Fermer</button></section>}
  </article>;
}
