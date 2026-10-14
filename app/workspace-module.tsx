"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { WorkspaceModule, WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { workspaceHref, workspaceSpaces } from "@/lib/navigation/spaces";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { CreatorStudio } from "./creator-studio";
import { ClientControlCenter } from "./client-control-center";
import { ClientProfile } from "./client-profile";
import { ProfessionalApplication } from "./professional-application";
import { OnboardingQueue } from "./onboarding-queue";
import { SalonControlCenter } from "./salon-control-center";
import { ProviderTeamAgenda } from "./team-management";
import { WorkspaceMessaging } from "./workspace-messaging";
import { LiveDashboard } from "./live-dashboard";
import { SocialDashboard } from "./social-dashboard";
import { ProviderAgenda, ProviderRevenue } from "./provider-activity";
import { ClientFavorites } from "./client-favorites";
import { NotificationCenter } from "./notification-center";
import { SupportInbox } from "./support-inbox";
import { ModerationInbox } from "./moderation-inbox";
import { CommentModeration } from "./comment-moderation";
import { CatalogModule } from "./super-admin";
import { RefundReview } from "./refund-review";
import { AccountDeletionQueue } from "./account-deletion-queue";

type Row = Record<string, unknown>;
type ResourceDefinition = { table: string; select: string; title: (row: Row) => string; meta: (row: Row) => string };

const resources: Partial<Record<NonNullable<WorkspaceModule["resource"]>, ResourceDefinition>> = {
  bookings: { table: "bookings", select: "id,status,starts_at,total_amount", title: (row) => `Rendez-vous ${shortId(row.id)}`, meta: (row) => `${label(row.status)} · ${date(row.starts_at)}` },
  payments: { table: "payments", select: "id,payment_status,amount,gross_amount,platform_fee,professional_net_amount,created_at", title: (row) => `${money(row.gross_amount ?? row.amount)}`, meta: (row) => `${label(row.payment_status)} · Commission ${money(row.platform_fee)} · Net ${money(row.professional_net_amount)} · ${date(row.created_at)}` },
  notifications: { table: "notifications", select: "id,title,body,created_at,read_at", title: (row) => text(row.title, "Notification"), meta: (row) => `${text(row.body, "")} · ${date(row.created_at)}` },
  messages: { table: "messages", select: "id,body,created_at", title: (row) => text(row.body, "Message"), meta: (row) => date(row.created_at) },
  profiles: { table: "profiles", select: "id,first_name,last_name,role", title: (row) => `${text(row.first_name, "Compte")} ${text(row.last_name, "")}`.trim(), meta: (row) => label(row.role) },
  providers: { table: "provider_profiles", select: "profile_id,business_name,status,city", title: (row) => text(row.business_name, "Professionnel"), meta: (row) => `${label(row.status)} · ${text(row.city, "Ville non renseignée")}` },
  businesses: { table: "businesses", select: "id,name,status,city", title: (row) => text(row.name, "Salon"), meta: (row) => `${label(row.status)} · ${text(row.city, "Ville non renseignée")}` },
  collaborators: { table: "collaborators_public", select: "id,display_name,title,is_active", title: (row) => text(row.display_name, "Collaborateur"), meta: (row) => `${text(row.title, "Équipe")} · ${row.is_active ? "Actif" : "Inactif"}` },
  services: { table: "provider_services", select: "id,title,price_amount,is_active", title: (row) => text(row.title, "Prestation"), meta: (row) => `${money(row.price_amount)} · ${row.is_active ? "Active" : "Inactive"}` },
  videos: { table: "posts", select: "id,caption,status,created_at", title: (row) => text(row.caption, "Publication"), meta: (row) => `${label(row.status)} · ${date(row.created_at)}` },
  reviews: { table: "reviews", select: "id,rating,comment,is_visible,created_at", title: (row) => `${text(row.rating, "–")}/5 · ${text(row.comment, "Avis")}`, meta: (row) => `${row.is_visible ? "Visible" : "Masqué"} · ${date(row.created_at)}` },
  reports: { table: "reports", select: "id,reason,status,created_at", title: (row) => text(row.reason, "Demande"), meta: (row) => `${label(row.status)} · ${date(row.created_at)}` },
  audit: { table: "audit_logs", select: "id,action,created_at", title: (row) => label(row.action), meta: (row) => date(row.created_at) },
  wallets: { table: "wallet_balances", select: "wallet_id,professional_id,currency,pending_balance,available_balance,total_earned,total_paid_out", title: (row) => `Professionnel ${shortId(row.professional_id)}`, meta: (row) => `Disponible ${money(row.available_balance)} · En attente ${money(row.pending_balance)} · Versé ${money(row.total_paid_out)}` },
  payouts: { table: "payouts", select: "id,provider_id,amount,currency,status,created_at", title: (row) => `${money(row.amount)} · ${label(row.status)}`, meta: (row) => `Professionnel ${shortId(row.provider_id)} · ${date(row.created_at)}` },
  reconciliation: { table: "reconciliation_runs", select: "id,provider,environment,status,matched_count,mismatch_count,missing_count,started_at", title: (row) => `${text(row.provider, "Fournisseur")} · ${label(row.status)}`, meta: (row) => `${text(row.environment, "")} · Écarts ${Number(row.mismatch_count)} · Manquants ${Number(row.missing_count)} · ${date(row.started_at)}` },
  "financial-events": { table: "financial_security_events", select: "id,event_type,severity,transaction_reference,created_at", title: (row) => `${label(row.event_type)} · ${label(row.severity)}`, meta: (row) => `${text(row.transaction_reference, "")} · ${date(row.created_at)}` },
  commissions: { table: "platform_commissions", select: "id,payment_id,rate,amount,currency,created_at", title: (row) => `${money(row.amount)} · ${Number(row.rate)} %`, meta: (row) => `Paiement ${shortId(row.payment_id)} · ${date(row.created_at)}` },
  disputes: { table: "disputes", select: "id,booking_id,priority,status,reason,created_at", title: (row) => `${text(row.reason, "Litige")} · ${label(row.status)}`, meta: (row) => `${label(row.priority)} · ${date(row.created_at)}` },
  sessions: { table: "admin_sessions", select: "id,user_id,signed_in_at,last_seen_at,mfa_verified,revoked_at", title: (row) => `Compte ${shortId(row.user_id)} · ${row.revoked_at ? "Révoquée" : "Enregistrée"}`, meta: (row) => `MFA ${row.mfa_verified ? "vérifié" : "non vérifié"} · Dernière activité ${date(row.last_seen_at)}` },
  promotions: { table: "promotions", select: "id,title,status,is_active,starts_at,ends_at", title: (row) => text(row.title, "Promotion"), meta: (row) => `${label(row.status)} · ${row.is_active ? "Active" : "Inactive"} · ${date(row.starts_at)} → ${date(row.ends_at)}` },
  campaigns: { table: "notification_campaigns", select: "id,title,channel,status,scheduled_at,sent_at,created_at", title: (row) => text(row.title, "Campagne"), meta: (row) => `${label(row.channel)} · ${label(row.status)} · ${row.sent_at ? date(row.sent_at) : "Non envoyée"}` },
  settings: { table: "app_settings", select: "key,description,value,is_sensitive", title: (row) => text(row.description, text(row.key, "Paramètre")), meta: (row) => JSON.stringify(row.value) ?? "Non renseigné" },
  "deletion-requests": { table: "account_deletion_requests", select: "id,profile_id,reason,status,requested_at", title: (row) => `Compte ${shortId(row.profile_id)} · ${label(row.status)}`, meta: (row) => `${text(row.reason, "Sans motif")} · ${date(row.requested_at)}` },
};

const fraudAlerts: ResourceDefinition = { table: "fraud_alerts", select: "id,alert_type,severity,status,created_at", title: row => `${label(row.alert_type)} · ${label(row.severity)}`, meta: row => `${label(row.status)} · ${date(row.created_at)}` };
const onboardingHistory: ResourceDefinition = { table: "onboarding_events", select: "id,provider_id,action,reason,created_at", title: (row) => `${label(row.action)} · ${shortId(row.provider_id)}`, meta: (row) => `${text(row.reason, "")} · ${date(row.created_at)}` };
const moderationHistory: ResourceDefinition = { table: "moderation_actions", select: "id,target_id,action,reason,created_at", title: (row) => `${label(row.action)} · ${shortId(row.target_id)}`, meta: (row) => `${text(row.reason, "")} · ${date(row.created_at)}` };
const financialHistory: ResourceDefinition = { table: "financial_audit_log", select: "id,action,transaction_reference,created_at", title: (row) => label(row.action), meta: (row) => `${text(row.transaction_reference, "")} · ${date(row.created_at)}` };
const refunds: ResourceDefinition = { table: "refunds", select: "id,payment_id,amount,status,reason,created_at", title: (row) => `${money(row.amount)} · ${label(row.status)}`, meta: (row) => `${text(row.reason, "")} · ${date(row.created_at)}` };

export function WorkspaceModuleView({ space, module, allowedModuleKeys, supabaseUrl, supabaseAnonKey, userId, providerApproved, canReplyToMessages = true, canManageBookings = false, staffBusinessId }: { space: WorkspaceSpaceKey; module: WorkspaceModule; allowedModuleKeys: string[]; supabaseUrl: string; supabaseAnonKey: string; userId: string; providerApproved: boolean; canReplyToMessages?: boolean; canManageBookings?: boolean; staffBusinessId?: string | null }) {
  configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey });
  const focused = (space === "pro" && ["dashboard", "services", "public-profile", "statistics", "bookings", "notifications"].includes(module.key)) || (space === "client" && ["bookings", "notifications"].includes(module.key));
  const supportInbox = (space === "support" && ["dashboard", "tickets", "unassigned", "mine", "priority", "escalations"].includes(module.key)) || (space === "operations" && module.key === "support") || (space === "admin" && module.key === "escalations");
  const moderationInbox = (space === "moderation" && ["dashboard", "reports"].includes(module.key)) || (space === "operations" && module.key === "moderation");
  const onboardingInbox = (space === "onboarding" && ["dashboard", "new", "in-progress", "requests", "approved", "rejected", "documents"].includes(module.key)) || (space === "operations" && module.key === "onboarding");
  const commentModeration = ["moderation", "admin"].includes(space) && module.key === "comments";
  const categoryManagement = space === "operations" && module.key === "categories";
  const refundReview = ["finance", "admin"].includes(space) && module.key === "refunds";
  const deletionQueue = space === "admin" && module.key === "deletion-requests";
  const [notice, setNotice] = useState("");
  const custom = moderationInbox || supportInbox || focused || (space === "onboarding" && ["dashboard", "new", "in-progress", "requests", "approved", "rejected", "documents"].includes(module.key)) || (space === "client" && module.key === "application") || (["client", "pro", "salon"].includes(space) && ["messages", "profile", "videos", "inspirations"].includes(module.key)) || (space === "client" && ["settings", "payments", "reviews", "support", "favorites"].includes(module.key)) || space === "salon" || (space === "pro" && ["agenda", "revenue", "team"].includes(module.key));
  const definition = custom || commentModeration || categoryManagement || onboardingInbox || refundReview || deletionQueue ? undefined
    : space === "admin" && module.key === "alerts" ? fraudAlerts
    : space === "admin" && module.key === "security" ? resources.sessions
    : space === "onboarding" && module.key === "history" ? onboardingHistory
    : space === "moderation" && module.key === "history" ? moderationHistory
    : (space === "finance" && module.key === "audit") || (space === "admin" && module.key === "financial-reports") ? financialHistory
    : ["finance", "admin"].includes(space) && module.key === "refunds" ? refunds
    : space === "finance" && module.key === "dashboard" ? resources.payments
    : module.resource ? resources[module.resource] : module.key === "dashboard" ? resources.bookings : undefined;
  const paymentStatus = space === "finance" && ["pending", "failed"].includes(module.key) ? module.key : null;
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLocaleLowerCase("fr");
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "unavailable">(definition ? "loading" : "unavailable");
  useEffect(() => {
    if (!definition) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const client = getSupabaseBrowserClient();
    if (!client) { window.clearTimeout(timeout); queueMicrotask(() => setState("unavailable")); return; }
    queueMicrotask(() => { if (active) { setRows([]); setState("loading"); } });
    let request = client.from(definition.table).select(definition.select).limit(100).abortSignal(controller.signal);
    if (paymentStatus) request = request.eq("payment_status", paymentStatus);
    if (definition.table === "app_settings") request = request.eq("is_sensitive", false);
    if (space === "admin" && module.key === "suspended") request = request.eq("is_suspended", true);
    if (definition.select.includes("created_at")) request = request.order("created_at", { ascending: false });
    request.then(({ data, error }) => {
      window.clearTimeout(timeout);
      if (!active) return;
      if (error) { setState("unavailable"); return; }
      const next = (data ?? []) as unknown as Row[];
      setRows(next); setState(next.length ? "ready" : "empty");
    });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [definition, paymentStatus, space, module.key, supabaseAnonKey, supabaseUrl]);
  const visibleRows = useMemo(() => query ? rows.filter((row) => JSON.stringify(row).toLocaleLowerCase("fr").includes(query)) : rows, [query, rows]);

  if (moderationInbox) return <ModerationInbox />;
  if (commentModeration) return <CommentModeration />;
  if (refundReview) return <RefundReview />;
  if (deletionQueue) return <AccountDeletionQueue />;
  if (categoryManagement) return <section>{notice && <p role="status">{notice}</p>}<CatalogModule services={false} notify={setNotice} /></section>;
  if (supportInbox) return <SupportInbox key={module.key} filter={module.key} userId={userId} />;
  if (module.key === "notifications") return <NotificationCenter userId={userId} />;
  if (focused) return <LiveDashboard role={space === "client" ? "client" : "provider"} userId={userId} displayName="" moduleKey={module.key} onBack={() => window.location.assign("/")} onSignOut={async () => { await getSupabaseBrowserClient()?.auth.signOut(); window.location.assign("/"); }} />;
  if (onboardingInbox) return <OnboardingQueue moduleKey={module.key === "onboarding" ? "dashboard" : module.key} />;
  if (space === "pro" && module.key === "team") return <SalonControlCenter module={module} userId={userId} />;
  if (space === "pro" && module.key === "agenda") return <><ProviderTeamAgenda userId={userId} /><ProviderAgenda userId={userId} /></>;
  if (space === "pro" && module.key === "revenue") return <ProviderRevenue userId={userId} />;
  if (space === "client" && module.key === "favorites") return <ClientFavorites userId={userId} />;
  if (space === "client" && module.key === "inspirations") return <SocialDashboard role="client" userId={userId} />;

  if (space === "salon" && module.key === "messages") return <WorkspaceMessaging userId={userId} canPublishStories canManageAssignments />;
  if (space === "staff" && module.key === "messages") return <WorkspaceMessaging userId={userId} canReply={canReplyToMessages} />;
  if (space === "staff" && module.key === "settings") return <StaffAccessSettings businessId={staffBusinessId ?? ""} />;
  if (space === "staff" && ["agenda", "bookings"].includes(module.key)) return <StaffBookings canManage={canManageBookings} />;
  if (space === "staff" && module.key === "services") return <StaffServices businessId={staffBusinessId ?? ""} />;
  if (space === "salon" && module.key !== "videos") return <SalonControlCenter module={module} userId={userId} />;
  if ((space === "pro" || space === "salon") && module.key === "videos") return <CreatorStudio userId={userId} providerApproved={providerApproved} />;
  if (space === "pro" && module.key === "messages") return <WorkspaceMessaging userId={userId} canPublishStories={providerApproved} canManageAssignments />;
  if (space === "client" && module.key === "messages") return <WorkspaceMessaging userId={userId} />;
  if (space === "client" && module.key === "profile") return <ClientProfile userId={userId} />;
  if (space === "client" && module.key === "application") return <ProfessionalApplication userId={userId} />;
  if (space === "client" && ["settings", "payments", "reviews", "support"].includes(module.key)) return <ClientControlCenter userId={userId} section={module.key} />;
  const shortcuts = workspaceSpaces[space].modules.filter((item) => item.key !== module.key && allowedModuleKeys.includes(item.key)).slice(0, 4);
  return <section className="workspace-content">
    <div className="workspace-intro"><div><h2>{module.label}</h2><p>{module.description}</p>{module.key === "dashboard" && (space === "pro" || space === "salon") && <Link className="workspace-quick-publish" href={workspaceHref(space, "videos")}>＋ Publier une vidéo</Link>}</div></div>
    {!["client", "pro"].includes(space) && <div className="workspace-metrics">
      <article><span>Éléments visibles</span><strong>{state === "ready" ? visibleRows.length : "—"}</strong><small>{query ? `Recherche « ${query} »` : "Périmètre autorisé"}</small></article>
      <article><span>État du module</span><strong>{state === "unavailable" ? "Limité" : "Actif"}</strong><small>Accès contrôlé côté serveur</small></article>
      <article><span>Espace</span><strong>{workspaceSpaces[space].label.replace("Espace ", "")}</strong><small>Session conservée</small></article>
    </div>
    }<div className="workspace-grid">
      <article className="workspace-panel"><header><div><span>Vue actuelle</span><h3>{module.label}</h3></div></header>
        {state === "loading" && <div className="workspace-empty">Chargement…</div>}
        {state === "unavailable" && <div className="workspace-empty"><strong>Données momentanément indisponibles</strong><p>Réessayez dans quelques instants. Aucun changement n’a été appliqué.</p></div>}
        {state === "empty" && <div className="workspace-empty"><strong>Aucun élément à afficher</strong><p>Vos informations apparaîtront ici dès votre première activité.</p></div>}
        {state === "ready" && definition && visibleRows.length === 0 && <div className="workspace-empty"><strong>Aucun résultat</strong><p>Essayez un autre mot-clé.</p></div>}
        {state === "ready" && definition && visibleRows.length > 0 && <div className="workspace-list">{visibleRows.map((row, index) => <div key={String(row.id ?? index)}><span>{definition.title(row)}</span><small>{definition.meta(row)}</small></div>)}</div>}
      </article>
      <aside className="workspace-panel workspace-shortcuts"><header><div><span>Accès rapides</span><h3>Continuer</h3></div></header>{shortcuts.map((item) => <Link href={workspaceHref(space, item.key)} key={item.key}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.description}</small></div><b>›</b></Link>)}</aside>
    </div>
  </section>;
}

function text(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value : fallback; }
function StaffAccessSettings({ businessId }: { businessId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function leave() {
    if (busy || !window.confirm("Quitter cette équipe ? Votre accès au salon sera révoqué immédiatement. Les rendez-vous et messages déjà créés resteront conservés.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/salon/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave", businessId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Impossible de quitter le salon.");
      window.location.assign("/app");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de quitter le salon."); setBusy(false); }
  }
  return <section className="workspace-content"><div className="workspace-intro"><div><h2>Accès au salon</h2><p>Vos autorisations sont limitées au rôle et aux permissions attribuées par le responsable.</p></div></div><article className="workspace-panel"><h3>Quitter l’équipe</h3><p>Cette action révoque votre accès au salon. Votre compte MATA Beauty reste actif et l’historique du salon est conservé.</p>{message && <p role="alert">{message}</p>}<button className="danger" disabled={busy} onClick={() => void leave()}>{busy ? "Révocation…" : "Quitter ce salon"}</button></article></section>;
}
function StaffBookings({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Array<{ id: string; status: string; starts_at: string; ends_at: string; provider_services: { title: string | null } | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const client = getSupabaseBrowserClient();
  const load = useCallback(async () => {
    if (!client) { setLoading(false); setMessage("Connexion indisponible."); return; }
    const { data, error } = await client.from("bookings").select("id,status,starts_at,ends_at,provider_services(title)").order("starts_at", { ascending: false }).limit(100);
    if (error) setMessage("Les rendez-vous autorisés n’ont pas pu être chargés.");
    setRows((data ?? []) as unknown as typeof rows); setLoading(false);
  }, [client]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function update(id: string, status: string) {
    if (!client || busyId) return;
    setBusyId(id); setMessage("");
    const { error } = await client.rpc("staff_update_booking_status", { target_booking_id: id, target_status: status });
    setBusyId("");
    if (error) { setMessage("Le rendez-vous n’a pas été modifié. Actualisez et vérifiez vos droits."); return; }
    setMessage("Rendez-vous mis à jour."); await load();
  }
  const actions: Record<string, Array<[string, string]>> = { pending: [["confirmed", "Confirmer"], ["declined", "Refuser"]], confirmed: [["in_progress", "Démarrer"], ["no_show", "Signaler une absence"]], in_progress: [["completed", "Terminer"]] };
  return <section className="workspace-content"><div className="workspace-intro"><div><h2>Mes rendez-vous</h2><p>Réservations qui vous sont attribuées, selon les accès du salon.</p></div></div><article className="workspace-panel">{message && <p role="status">{message}</p>}{loading ? <p>Chargement…</p> : rows.length ? <div className="workspace-list">{rows.map(row => <div key={row.id}><span>{row.provider_services?.title ?? "Prestation"} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.starts_at))}</span><small>{row.status.replaceAll("_", " ")} · jusqu’à {new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(row.ends_at))}</small>{canManage && (actions[row.status] ?? []).map(([status, label]) => <button key={status} disabled={busyId === row.id} onClick={() => void update(row.id, status)}>{busyId === row.id ? "Mise à jour…" : label}</button>)}</div>)}</div> : <p>Aucun rendez-vous affecté.</p>}</article></section>;
}
function StaffServices({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; title: string; duration_minutes: number; price_amount: number; currency: string }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void getSupabaseBrowserClient()?.from("provider_services").select("id,title,duration_minutes,price_amount,currency").eq("business_id", businessId).eq("is_active", true).is("archived_at", null).order("title").then(({ data }) => { if (active) { setRows((data ?? []) as typeof rows); setLoading(false); } });
    return () => { active = false; };
  }, [businessId]);
  return <section className="workspace-content"><div className="workspace-intro"><div><h2>Prestations du salon</h2><p>Catalogue du salon auquel vous êtes rattaché.</p></div></div><article className="workspace-panel">{loading ? <p>Chargement…</p> : rows.length ? <div className="workspace-list">{rows.map(row => <div key={row.id}><span>{row.title}</span><small>{row.duration_minutes} min · {new Intl.NumberFormat("fr-FR", { style: "currency", currency: row.currency, maximumFractionDigits: 0 }).format(row.price_amount)}</small></div>)}</div> : <p>Aucune prestation à afficher.</p>}</article></section>;
}
function label(value: unknown) { return text(value, "Non renseigné").replaceAll("_", " "); }
function shortId(value: unknown) { return text(value, "").slice(0, 8).toUpperCase(); }
function date(value: unknown) { if (typeof value !== "string") return "Date non renseignée"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Date non renseignée" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function money(value: unknown) { const amount = typeof value === "number" ? value : Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(amount) : "Montant non renseigné"; }
