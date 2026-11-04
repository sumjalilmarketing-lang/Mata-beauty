"use client";
import { SalonStaffTasks } from "./salon-staff-tasks";

import Link from "next/link";
import { formatRecordedMoney } from "@/lib/domain/admin-money";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { WorkspaceModule, WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { workspaceHref, workspaceSpaces } from "@/lib/navigation/spaces";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { CreatorStudio } from "./creator-studio";
import { ClientControlCenter } from "./client-control-center";
import { ClientProfile } from "./client-profile";
import { ProfessionalApplication } from "./professional-application";
import { OnboardingQueue } from "./onboarding-queue";
import { SalonControlCenter } from "./salon-control-center";
import { StaffCalendar } from "./staff-calendar";
import { ProviderTeamAgenda, StaffAgenda, StaffServices } from "./team-management";
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
import { DepartmentTeamConsole } from "./department-team-console";
import { DepartmentCases } from "./department-cases";
import {HrWorkspace}from "./hr-workspace";
import { CommercialField } from "./commercial-field";
import { CommercialCrm } from "./commercial-crm";
import { FinanceOverview } from "./finance-overview";
import { RefundReview } from "./refund-review";
import { AccountDeletionQueue } from "./account-deletion-queue";

import { workspaceListQuery, workspacePage, workspacePageSize } from "@/lib/domain/workspace-list-query";

type Row = Record<string, unknown>;
type ResourceDefinition = { table: string; select: string; title: (row: Row) => string; meta: (row: Row) => string };

const resources: Partial<Record<NonNullable<WorkspaceModule["resource"]>, ResourceDefinition>> = {
  bookings: { table: "bookings", select: "id,status,starts_at,total_amount", title: (row) => `Rendez-vous ${shortId(row.id)}`, meta: (row) => `${label(row.status)} · ${date(row.starts_at)}` },
  payments: { table: "payments", select: "id,payment_status,amount,gross_amount,platform_fee,professional_net_amount,currency,created_at", title: (row) => `${money(row.gross_amount ?? row.amount, row.currency)}`, meta: (row) => `${label(row.payment_status)} · Commission ${money(row.platform_fee, row.currency)} · Net ${money(row.professional_net_amount, row.currency)} · ${date(row.created_at)}` },
  notifications: { table: "notifications", select: "id,title,body,created_at,read_at", title: (row) => text(row.title, "Notification"), meta: (row) => `${text(row.body, "")} · ${date(row.created_at)}` },
  messages: { table: "messages", select: "id,body,created_at", title: (row) => text(row.body, "Message"), meta: (row) => date(row.created_at) },
  profiles: { table: "profiles", select: "id,first_name,last_name,role", title: (row) => `${text(row.first_name, "Compte")} ${text(row.last_name, "")}`.trim(), meta: (row) => label(row.role) },
  providers: { table: "provider_profiles", select: "profile_id,business_name,status,city", title: (row) => text(row.business_name, "Professionnel"), meta: (row) => `${label(row.status)} · ${text(row.city, "Ville non renseignée")}` },
  businesses: { table: "businesses", select: "id,name,status,city", title: (row) => text(row.name, "Salon"), meta: (row) => `${label(row.status)} · ${text(row.city, "Ville non renseignée")}` },
  collaborators: { table: "collaborators", select: "id,display_name,title,is_active", title: (row) => text(row.display_name, "Collaborateur"), meta: (row) => `${text(row.title, "Équipe")} · ${row.is_active ? "Actif" : "Inactif"}` },
  services: { table: "provider_services", select: "id,title,price_amount,currency,is_active", title: (row) => text(row.title, "Prestation"), meta: (row) => `${money(row.price_amount, row.currency)} · ${row.is_active ? "Active" : "Inactive"}` },
  videos: { table: "posts", select: "id,caption,status,created_at", title: (row) => text(row.caption, "Publication"), meta: (row) => `${label(row.status)} · ${date(row.created_at)}` },
  reviews: { table: "reviews", select: "id,rating,comment,is_visible,created_at", title: (row) => `${text(row.rating, "–")}/5 · ${text(row.comment, "Avis")}`, meta: (row) => `${row.is_visible ? "Visible" : "Masqué"} · ${date(row.created_at)}` },
  reports: { table: "reports", select: "id,reason,status,created_at", title: (row) => text(row.reason, "Demande"), meta: (row) => `${label(row.status)} · ${date(row.created_at)}` },
  audit: { table: "audit_logs", select: "id,action,created_at", title: (row) => label(row.action), meta: (row) => date(row.created_at) },
  wallets: { table: "wallet_balances", select: "wallet_id,professional_id,currency,pending_balance,available_balance,total_earned,total_paid_out", title: (row) => `Professionnel ${shortId(row.professional_id)}`, meta: (row) => `Disponible ${money(row.available_balance, row.currency)} · En attente ${money(row.pending_balance, row.currency)} · Versé ${money(row.total_paid_out, row.currency)}` },
  payouts: { table: "payouts", select: "id,provider_id,amount,currency,status,created_at", title: (row) => `${money(row.amount, row.currency)} · ${label(row.status)}`, meta: (row) => `Professionnel ${shortId(row.provider_id)} · ${date(row.created_at)}` },
  reconciliation: { table: "reconciliation_runs", select: "id,provider,environment,status,matched_count,mismatch_count,missing_count,started_at", title: (row) => `${text(row.provider, "Fournisseur")} · ${label(row.status)}`, meta: (row) => `${text(row.environment, "")} · Écarts ${Number(row.mismatch_count)} · Manquants ${Number(row.missing_count)} · ${date(row.started_at)}` },
  "financial-events": { table: "financial_security_events", select: "id,event_type,severity,transaction_reference,created_at", title: (row) => `${label(row.event_type)} · ${label(row.severity)}`, meta: (row) => `${text(row.transaction_reference, "")} · ${date(row.created_at)}` },
  ledger: { table: "wallet_ledger", select: "id,transaction_type,amount,status,reference,created_at,wallets(currency)", title: row => `${label(row.transaction_type)} · ${money(row.amount, paymentCurrency(row.wallets))}`, meta: row => `${label(row.status)} · ${text(row.reference, "")} · ${date(row.created_at)}` },
  commissions: { table: "platform_commissions", select: "id,payment_id,rate,amount,currency,created_at", title: (row) => `${money(row.amount, row.currency)} · ${Number(row.rate)} %`, meta: (row) => `Paiement ${shortId(row.payment_id)} · ${date(row.created_at)}` },
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
const refunds: ResourceDefinition = { table: "refunds", select: "id,payment_id,amount,status,reason,created_at,payments(currency)", title: (row) => `${money(row.amount, paymentCurrency(row.payments))} · ${label(row.status)}`, meta: (row) => `${text(row.reason, "")} · ${date(row.created_at)}` };

export function WorkspaceModuleView({ space, module, allowedModuleKeys, supabaseUrl, supabaseAnonKey, userId, canManageCrmAssignments = false, isSuperAdmin=false, canReadFinance=false, canDecideRefunds=false, canManageSupport=false, providerApproved, staffCanReply, staffCanManageBookings, collaboratorAccessEnabled = false }: { space: WorkspaceSpaceKey; module: WorkspaceModule; allowedModuleKeys: string[]; supabaseUrl: string; supabaseAnonKey: string; userId: string; canManageCrmAssignments?: boolean; isSuperAdmin?:boolean; canReadFinance?:boolean; canDecideRefunds?:boolean; canManageSupport?:boolean; providerApproved: boolean; staffCanReply: boolean; staffCanManageBookings: boolean; collaboratorAccessEnabled?: boolean }) {
  configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey });
  const focused = (space === "pro" && ["dashboard", "services", "public-profile", "statistics", "bookings", "notifications"].includes(module.key)) || (space === "client" && ["bookings", "notifications"].includes(module.key));
  const supportInbox = (space === "support" && ["dashboard", "tickets", "unassigned", "mine", "priority", "escalations"].includes(module.key)) || (space === "operations" && module.key === "support") || (space === "admin" && module.key === "escalations");
  const moderationInbox = (space === "moderation" && ["dashboard", "reports"].includes(module.key)) || (space === "operations" && module.key === "moderation");
  const crmView = space === "commercial" && ["dashboard","crm","follow-ups"].includes(module.key);
  const onboardingInbox = (["onboarding", "commercial"].includes(space) && ["dashboard", "dossiers", "new", "in-progress", "requests", "approved", "rejected", "documents", "history"].includes(module.key)) || (space === "operations" && module.key === "onboarding");
  const commentModeration = ["moderation", "admin"].includes(space) && module.key === "comments";
  const categoryManagement = space === "operations" && module.key === "categories";
  const refundReview = ["finance", "admin"].includes(space) && module.key === "refunds";
  const deletionQueue = space === "admin" && module.key === "deletion-requests";
  const [notice, setNotice] = useState("");
  const financeOverview = space === "finance" && module.key === "dashboard";
  const departmentCases = ["commercial","finance","support"].includes(space) && (module.key === "cases" || (module.key === "dashboard" && ((space === "finance" && !canReadFinance) || (space === "support" && !canManageSupport))));
  const teamConsole = module.key === "teams" && ["admin","commercial","finance","support","hr"].includes(space);
  const accountSettings = space === "pro" && module.key === "settings";
  const fieldView = space === "commercial" && ["field","reports","appointments"].includes(module.key);
  const custom = space === "hr" || fieldView || accountSettings || departmentCases || teamConsole || crmView || financeOverview || moderationInbox || supportInbox || focused || (["onboarding", "commercial"].includes(space) && ["dashboard", "dossiers", "new", "in-progress", "requests", "approved", "rejected", "documents", "history"].includes(module.key)) || (space === "client" && module.key === "application") || (["client", "pro", "salon"].includes(space) && ["messages", "profile", "videos", "inspirations"].includes(module.key)) || (space === "staff" && ["dashboard", "agenda", "bookings", "messages", "services", "availability", "notifications", "tasks"].includes(module.key)) || (space === "client" && ["settings", "payments", "reviews", "support", "favorites"].includes(module.key)) || space === "salon" || (space === "pro" && ["agenda", "revenue", "team"].includes(module.key));
  const definition = custom || commentModeration || categoryManagement || onboardingInbox || refundReview || deletionQueue ? undefined
    : space === "admin" && module.key === "alerts" ? fraudAlerts
    : space === "admin" && module.key === "security" ? resources.sessions
    : ["onboarding", "commercial"].includes(space) && module.key === "history" ? onboardingHistory
    : space === "moderation" && module.key === "history" ? moderationHistory
    : (space === "finance" && module.key === "audit") || (space === "admin" && module.key === "financial-reports") ? financialHistory
    : ["finance", "admin"].includes(space) && module.key === "refunds" ? refunds
    : space === "finance" && module.key === "dashboard" ? resources.payments
    : module.resource ? resources[module.resource] : module.key === "dashboard" ? resources.bookings : undefined;
  const paymentStatus = space === "finance" && ["pending", "failed"].includes(module.key) ? module.key : null;
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().slice(0, 160);
  const page = workspacePage(searchParams.get("page"));
  const router = useRouter();
  const pathname = usePathname();
  const [total, setTotal] = useState<number | null>(null);
  function changePage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "unavailable">(definition ? "loading" : "unavailable");
  useEffect(() => {
    if (!definition) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const client = getSupabaseBrowserClient();
    if (!client) { window.clearTimeout(timeout); queueMicrotask(() => setState("unavailable")); return; }
    queueMicrotask(() => { if (active) { setRows([]); setTotal(null); setState("loading"); } });
    let request = workspaceListQuery(client, definition, { page, query, signal: controller.signal });
    if (paymentStatus) request = request.eq("payment_status", paymentStatus);
    if (definition.table === "app_settings") request = request.eq("is_sensitive", false);
    if (space === "admin" && module.key === "suspended") request = request.eq("is_suspended", true);
    void Promise.resolve(request).then(({ data, error, count }) => {
      window.clearTimeout(timeout);
      if (!active) return;
      if (error) { setState("unavailable"); return; }
      const next = (data ?? []) as unknown as Row[];
      setRows(next); setTotal(count); setState(next.length ? "ready" : "empty");
    }).catch(() => { window.clearTimeout(timeout); if (active) { setRows([]); setState("unavailable"); } });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [definition, paymentStatus, space, module.key, supabaseAnonKey, supabaseUrl, query, page]);
  const visibleRows = rows;

  if (fieldView) return <CommercialField view={module.key as "field"|"reports"|"appointments"} userId={userId} />;
  if (teamConsole) return <DepartmentTeamConsole canCreateCommercialTeam={space === "commercial" && canManageCrmAssignments} department={space === "admin" ? undefined : space as "commercial"|"finance"|"support"|"hr"} />;
  if (space === "hr") return <HrWorkspace moduleKey={module.key} isSuper={isSuperAdmin}/>;
  if (departmentCases) return <DepartmentCases department={space as "commercial"|"finance"|"support"|"hr"} />;
  if (crmView) return <CommercialCrm key={module.key} userId={userId} canAssign={canManageCrmAssignments} isSuper={isSuperAdmin} dueOnly={module.key === "follow-ups"} />;
  if (financeOverview) return <FinanceOverview allowedModuleKeys={allowedModuleKeys} />;
  if (moderationInbox) return <ModerationInbox />;
  if (commentModeration) return <CommentModeration />;
  if (refundReview) return <RefundReview readOnly={space === "finance" && !canDecideRefunds} />;
  if (deletionQueue) return <AccountDeletionQueue />;
  if (categoryManagement) return <section>{notice && <p role="status">{notice}</p>}<CatalogModule services={false} notify={setNotice} /></section>;
  if (supportInbox) return <SupportInbox key={module.key} filter={module.key} userId={userId} />;
  if (module.key === "notifications") return <NotificationCenter userId={userId} />;
  if (focused) return <LiveDashboard role={space === "client" ? "client" : "provider"} userId={userId} displayName="" moduleKey={module.key} onBack={() => window.location.assign("/")} onSignOut={async () => { await getSupabaseBrowserClient()?.auth.signOut(); window.location.assign("/"); }} />;
  if (onboardingInbox) return <OnboardingQueue moduleKey={["onboarding","dossiers"].includes(module.key) ? "dashboard" : module.key} />;
  if (space === "pro" && module.key === "team") return <SalonControlCenter module={module} userId={userId} collaboratorAccessEnabled={collaboratorAccessEnabled} />;
  if (space === "pro" && module.key === "agenda") return <><ProviderTeamAgenda userId={userId} /><ProviderAgenda userId={userId} /></>;
  if (space === "pro" && module.key === "revenue") return <ProviderRevenue userId={userId} />;
  if (space === "client" && module.key === "favorites") return <ClientFavorites userId={userId} />;
  if (space === "client" && module.key === "inspirations") return <SocialDashboard role="client" userId={userId} />;

  if (space === "salon" && module.key === "messages") return <WorkspaceMessaging userId={userId} />;
  if (space === "staff" && module.key === "tasks") return <SalonStaffTasks />;
  if (space === "staff" && module.key === "availability") return <StaffCalendar />;
  if (space === "staff" && module.key === "messages") return <WorkspaceMessaging userId={userId} staffMode canReply={staffCanReply} />;
  if (space === "staff" && ["agenda", "bookings"].includes(module.key)) return <StaffAgenda canManage={staffCanManageBookings} />;
  if (space === "staff" && module.key === "dashboard") return <StaffAgenda canManage={staffCanManageBookings} />;
  if (space === "staff" && module.key === "services") return <StaffServices />;
  if (space === "salon" && module.key !== "videos") return <SalonControlCenter module={module} userId={userId} collaboratorAccessEnabled={collaboratorAccessEnabled} />;
  if ((space === "pro" || space === "salon") && module.key === "videos") return <CreatorStudio userId={userId} providerApproved={providerApproved} />;
  if ((space === "client" || space === "pro") && module.key === "messages") return <WorkspaceMessaging userId={userId} />;
  if (space === "client" && module.key === "profile") return <ClientProfile userId={userId} />;
  if (space === "client" && module.key === "application") return <ProfessionalApplication userId={userId} />;
  if (accountSettings) return <ClientControlCenter userId={userId} section="settings" />;
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
        {definition && <form className="workspace-list-search" onSubmit={event => {
          event.preventDefault();
          const params = new URLSearchParams(searchParams.toString());
          const value = String(new FormData(event.currentTarget).get("query") ?? "").trim().slice(0, 160);
          if (value) params.set("q", value); else params.delete("q");
          params.delete("page");
          router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
        }}><label>Rechercher un intitulé ou une référence<input type="search" name="query" key={query} defaultValue={query} maxLength={160} /></label><button type="submit">Rechercher</button>{query && <Link href={pathname}>Effacer la recherche</Link>}</form>}
        {state === "loading" && <div className="workspace-empty">Chargement…</div>}
        {state === "unavailable" && <div className="workspace-empty"><strong>Données momentanément indisponibles</strong><p>Réessayez dans quelques instants. Aucun changement n’a été appliqué.</p></div>}
        {state === "empty" && <div className="workspace-empty"><strong>Aucun élément à afficher</strong><p>{query ? "Aucun intitulé ou référence ne correspond à votre recherche." : "Vos informations apparaîtront ici dès votre première activité."}</p></div>}
        {state === "ready" && definition && visibleRows.length === 0 && <div className="workspace-empty"><strong>Aucun résultat</strong><p>Essayez un autre mot-clé.</p></div>}
        {state === "ready" && definition && visibleRows.length > 0 && <div className="workspace-list">{visibleRows.map((row, index) => <div key={String(row.id ?? index)}><span>{definition.title(row)}</span><small>{definition.meta(row)}</small></div>)}</div>}
        {definition && <nav aria-label="Pagination des résultats" className="workspace-pagination">
          <p role="status">{total === null ? (state === "unavailable" ? "Résultats indisponibles." : "Chargement des résultats…") : `${total} résultat(s) autorisé(s) · ${workspacePageSize} par page · Page ${page}`}</p>
          {query && <p>Recherche sur les intitulés et les références, dans tous les résultats autorisés.</p>}
          <div><button type="button" disabled={page <= 1 || state === "loading"} onClick={() => changePage(1)}>Première page</button><button type="button" disabled={page <= 1 || state === "loading"} onClick={() => changePage(page - 1)}>Précédent</button><button type="button" disabled={total === null || page * workspacePageSize >= total || state === "loading"} onClick={() => changePage(page + 1)}>Suivant</button></div>
        </nav>}
      </article>
      <aside className="workspace-panel workspace-shortcuts"><header><div><span>Accès rapides</span><h3>Continuer</h3></div></header>{shortcuts.map((item) => <Link href={workspaceHref(space, item.key)} key={item.key}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.description}</small></div><b>›</b></Link>)}</aside>
    </div>
  </section>;
}

function text(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value : fallback; }
function label(value: unknown) { return text(value, "Non renseigné").replaceAll("_", " "); }
function shortId(value: unknown) { return text(value, "").slice(0, 8).toUpperCase(); }
function date(value: unknown) { if (typeof value !== "string") return "Date non renseignée"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Date non renseignée" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function paymentCurrency(value: unknown) {
  const payment = Array.isArray(value) ? value[0] : value;
  return payment && typeof payment === "object" && "currency" in payment ? payment.currency : null;
}
function money(value: unknown, currency: unknown) { return formatRecordedMoney(value, currency); }
