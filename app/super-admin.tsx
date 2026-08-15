"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient, getSupabaseConfiguration } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type AdminContext = {
  is_super_admin: boolean;
  roles: string[];
  permissions: string[];
  requires_mfa: boolean;
};

type Metrics = {
  users_total: number;
  users_today: number;
  users_week: number;
  clients_active: number;
  providers_active: number;
  providers_pending: number;
  salons_active: number;
  bookings_today: number;
  bookings_week: number;
  bookings_confirmed: number;
  bookings_cancelled: number;
  gross_revenue: number;
  commissions: number;
  payments_pending: number;
  payouts_pending: number;
  disputes_open: number;
  reports_open: number;
  tickets_open: number;
  average_order: number;
};

type UserRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  phone: string | null;
  account_role: string;
  is_suspended: boolean;
  city: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  bookings_count: number;
  reports_count: number;
  verification_status: string;
};

type ProviderRow = {
  profile_id: string;
  business_name: string;
  city: string;
  status: string;
  average_rating: number | string;
  review_count: number;
  created_at: string;
};

type BookingRow = {
  id: string;
  starts_at: string;
  status: string;
  total_amount: number;
  currency: string;
  location_mode: string;
  provider_profiles: { business_name: string } | Array<{ business_name: string }> | null;
  provider_services: { title: string; duration_minutes: number } | Array<{ title: string; duration_minutes: number }> | null;
};

type CatalogRow = {
  id: string;
  name?: string;
  title?: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  image_url?: string | null;
  parent_id?: string | null;
  is_active: boolean;
  sort_order?: number;
  duration_minutes?: number;
  price_amount?: number;
};

type FinanceRow = {
  id: string;
  booking_id: string;
  payment_status: string;
  payment_method: string;
  amount: number;
  currency: string;
  is_test: boolean;
  created_at: string;
};

type CommissionRuleRow = { id: string; name: string; rate: number | string; is_active: boolean; valid_from: string; valid_until: string | null };
type CommissionEntryRow = { id: string; payment_id: string; rate: number | string; amount: number; currency: string; created_at: string };

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

type SocialMetrics = {
  posts_today: number;
  published: number;
  pending: number;
  reported: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  booking_clicks: number;
  bookings: number;
  gross_amount: number;
};

type SocialPostRow = {
  id: string;
  author_id: string;
  caption: string;
  status: string;
  post_type: string;
  thumbnail_url: string | null;
  is_sponsored: boolean;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  published_at: string | null;
  created_at: string;
  provider_profiles: { business_name: string; city: string } | Array<{ business_name: string; city: string }> | null;
};

type SearchResult = { entity_type: string; entity_id: string; title: string; subtitle: string };

async function withTimeout<T>(operation: PromiseLike<T>, timeoutMs = 8000): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Le service met trop de temps à répondre.")), timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(operation), timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

const navigation = [
  { key: "overview", label: "Vue d’ensemble", icon: "⌂", permission: "users.read" },
  { key: "users", label: "Utilisateurs", icon: "◎", permission: "users.read" },
  { key: "providers", label: "Prestataires", icon: "✦", permission: "providers.read" },
  { key: "salons", label: "Salons", icon: "⌑", permission: "providers.read" },
  { key: "verification", label: "Vérifications", icon: "✓", permission: "documents.review" },
  { key: "bookings", label: "Réservations", icon: "▣", permission: "bookings.read" },
  { key: "calendar", label: "Calendrier", icon: "□", permission: "bookings.read" },
  { key: "categories", label: "Catégories", icon: "◇", permission: "categories.manage" },
  { key: "services", label: "Prestations", icon: "≡", permission: "categories.manage" },
  { key: "payments", label: "Paiements", icon: "¤", permission: "payments.read" },
  { key: "commissions", label: "Commissions", icon: "%", permission: "commissions.manage" },
  { key: "payouts", label: "Reversements", icon: "↗", permission: "payouts.manage" },
  { key: "reviews", label: "Avis", icon: "★", permission: "reviews.moderate" },
  { key: "reports", label: "Signalements", icon: "!", permission: "reports.manage" },
  { key: "disputes", label: "Litiges", icon: "⚖", permission: "reports.manage" },
  { key: "promotions", label: "Promotions", icon: "◈", permission: "content.manage" },
  { key: "notifications", label: "Notifications", icon: "◌", permission: "notifications.send" },
  { key: "support", label: "Support", icon: "?", permission: "support.manage" },
  { key: "content", label: "Contenu social", icon: "▶", permission: "content.manage" },
  { key: "administrators", label: "Administrateurs", icon: "♜", permission: "roles.manage" },
  { key: "roles", label: "Rôles et permissions", icon: "⌘", permission: "roles.manage" },
  { key: "statistics", label: "Statistiques", icon: "↗", permission: "users.read" },
  { key: "audit", label: "Journaux d’audit", icon: "≣", permission: "audit.read" },
  { key: "security", label: "Sécurité", icon: "⌾", permission: "roles.manage" },
  { key: "settings", label: "Paramètres", icon: "⚙", permission: "settings.read" },
  { key: "maintenance", label: "Maintenance", icon: "△", permission: "settings.update" },
] as const;
type ModuleKey = typeof navigation[number]["key"];

const adminRoleLabels: Record<string, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  support: "Agent support",
  verification_agent: "Agent onboarding",
  finance: "Responsable finance",
  moderator: "Modérateur",
  content_manager: "Responsable contenu",
};

function canAccessModule(context: AdminContext, key: ModuleKey, permission: string) {
  if (context.is_super_admin) return true;
  if ((key === "overview" || key === "statistics") && !context.roles.includes("admin")) return false;
  return context.permissions.includes(permission);
}

function landingModule(context: AdminContext): ModuleKey {
  if (context.is_super_admin || context.roles.includes("admin")) return "overview";
  if (context.roles.includes("support")) return "support";
  if (context.roles.includes("verification_agent")) return "verification";
  if (context.roles.includes("finance")) return "payments";
  if (context.roles.includes("moderator")) return "reports";
  if (context.roles.includes("content_manager")) return "content";
  return navigation.find((item) => canAccessModule(context, item.key, item.permission))?.key ?? "overview";
}

const metricDefinitions: Array<{ key: keyof Metrics; label: string; tone?: string; currency?: boolean }> = [
  { key: "users_total", label: "Utilisateurs" },
  { key: "users_today", label: "Nouveaux aujourd’hui", tone: "positive" },
  { key: "providers_active", label: "Prestataires actifs" },
  { key: "providers_pending", label: "Validations urgentes", tone: "warning" },
  { key: "salons_active", label: "Salons actifs" },
  { key: "bookings_today", label: "Réservations du jour" },
  { key: "bookings_week", label: "Réservations semaine" },
  { key: "gross_revenue", label: "Chiffre d’affaires", currency: true },
  { key: "commissions", label: "Commissions Mata", currency: true },
  { key: "payments_pending", label: "Paiements en attente", tone: "warning" },
  { key: "disputes_open", label: "Litiges ouverts", tone: "danger" },
  { key: "tickets_open", label: "Tickets ouverts" },
];

function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }) : "Jamais";
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = ["approved", "confirmed", "paid", "published", "active", "resolved"].some((item) => normalized.includes(item))
    ? "success"
    : ["rejected", "suspended", "failed", "cancelled", "urgent"].some((item) => normalized.includes(item))
      ? "danger"
      : ["pending", "draft", "open", "review"].some((item) => normalized.includes(item))
        ? "warning"
        : "neutral";
  return <span className={`admin-status ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function PermissionGuard({ permission, context, children }: { permission: string; context: AdminContext; children: React.ReactNode }) {
  return context.is_super_admin || context.permissions.includes(permission) ? children : null;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="admin-empty"><span>✦</span><h3>{title}</h3><p>{description}</p></div>;
}

function LoadingSkeleton() {
  return <div className="admin-loading" aria-label="Chargement"><i /><i /><i /><i /></div>;
}

function ConfirmationModal({
  title, description, dangerous = false, onCancel, onConfirm,
}: {
  title: string;
  description: string;
  dangerous?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="admin-modal-backdrop">
    <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
      <p className="admin-kicker">Action sensible</p>
      <h2 id="confirmation-title">{title}</h2>
      <p>{description}</p>
      <label>Motif obligatoire<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={2} /></label>
      <div className="admin-modal-actions">
        <button className="secondary" onClick={onCancel}>Annuler</button>
        <button className={dangerous ? "danger" : "primary"} disabled={busy || reason.trim().length < 2} onClick={() => {
          setBusy(true);
          void onConfirm(reason).finally(() => setBusy(false));
        }}>{busy ? "Traitement…" : "Confirmer"}</button>
      </div>
    </section>
  </div>;
}

export function SuperAdminApp({ supabaseUrl, supabaseAnonKey }: { supabaseUrl: string; supabaseAnonKey: string }) {
  configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey });
  const [context, setContext] = useState<AdminContext | null>(null);
  const [sessionState, setSessionState] = useState<"loading" | "anonymous" | "unauthorized" | "ready">("loading");
  const [activeModule, setActiveModule] = useState<ModuleKey>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [notice, setNotice] = useState("");

  const resolveSession = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setSessionState("anonymous");
        return;
      }
      const { data: session } = await withTimeout(supabase.auth.getSession());
      if (!session.session?.user) {
        setContext(null);
        setSessionState("anonymous");
        return;
      }
      const { data, error } = await withTimeout(supabase.rpc("get_admin_context"));
      const next = data as AdminContext | null;
      if (error || !next || (!next.is_super_admin && !next.permissions.length)) {
        setContext(null);
        setSessionState("unauthorized");
        return;
      }
      setContext(next);
      setActiveModule((current) => {
        const currentItem = navigation.find((item) => item.key === current);
        return currentItem && canAccessModule(next, currentItem.key, currentItem.permission) ? current : landingModule(next);
      });
      await supabase.rpc("record_admin_session", { client_user_agent: window.navigator.userAgent });
      setSessionState("ready");
    } catch {
      setContext(null);
      setSessionState("anonymous");
      setNotice("Connexion au service momentanément indisponible. Réessayez.");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(resolveSession);
  }, [resolveSession]);

  useEffect(() => {
    if (!context || globalQuery.trim().length < 2) {
      void Promise.resolve().then(() => setSearchResults([]));
      return;
    }
    const timer = window.setTimeout(async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data } = await supabase.rpc("admin_global_search", { search_term: globalQuery.trim() });
      setSearchResults((data ?? []) as SearchResult[]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [context, globalQuery]);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.rpc("close_admin_session");
    await supabase?.auth.signOut();
    setContext(null);
    setSessionState("anonymous");
  }

  if (sessionState === "loading") return <main className="admin-auth-shell"><LoadingSkeleton /></main>;
  if (sessionState === "anonymous") return <AdminLogin onAuthenticated={resolveSession} configured={getSupabaseConfiguration().configured} />;
  if (sessionState === "unauthorized") return <AccessDenied onSignOut={signOut} />;
  if (!context) return null;

  const visibleNavigation = navigation.filter((item) => canAccessModule(context, item.key, item.permission));
  const effectiveModule = visibleNavigation.some((item) => item.key === activeModule) ? activeModule : landingModule(context);
  const current = navigation.find((item) => item.key === effectiveModule) ?? visibleNavigation[0];
  const roleLabel = context.is_super_admin ? adminRoleLabels.super_admin : context.roles.map((role) => adminRoleLabels[role] ?? role).join(", ");
  const roleInitials = context.is_super_admin ? "SA" : context.roles.includes("verification_agent") ? "ON" : context.roles[0]?.slice(0, 2).toUpperCase() ?? "AD";

  return <main className={`super-admin-shell ${collapsed ? "collapsed" : ""}`}>
    <aside className={`admin-sidebar ${mobileNav ? "mobile-open" : ""}`}>
      <button className="admin-brand" onClick={() => setActiveModule(landingModule(context))}><Image src="/brand/mata-app-icon.webp" alt="" width={42} height={42} unoptimized /><strong>MATA<small>CONTROL CENTER</small></strong></button>
      <div className="admin-role-card"><i>{roleInitials}</i><span><strong>{roleLabel}</strong><small>Accès sécurisé</small></span></div>
      <nav aria-label="Navigation Super Admin">{visibleNavigation.map((item) =>
        <button key={item.key} className={activeModule === item.key ? "active" : ""} onClick={() => { setActiveModule(item.key); setMobileNav(false); }} title={item.label}>
          <i>{item.icon}</i><span>{item.label}</span>
        </button>,
      )}</nav>
      <button className="admin-signout" onClick={() => void signOut()}><i>↪</i><span>Se déconnecter</span></button>
    </aside>
    <section className="admin-workspace">
      <header className="admin-topbar">
        <button className="admin-menu-button" aria-label="Ouvrir le menu" onClick={() => setMobileNav((value) => !value)}>☰</button>
        <button className="admin-collapse" aria-label="Replier la navigation" onClick={() => setCollapsed((value) => !value)}>◀</button>
        <div className="admin-global-search">
          <span>⌕</span>
          <input value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Rechercher un utilisateur, une réservation, un paiement…" />
          {searchResults.length > 0 && <div className="admin-search-results">{searchResults.map((result) =>
            <button key={`${result.entity_type}-${result.entity_id}`} onClick={() => {
              const target: ModuleKey = result.entity_type === "user" ? "users" : result.entity_type === "provider" ? "providers" : result.entity_type === "booking" ? "bookings" : result.entity_type === "payment" ? "payments" : result.entity_type === "ticket" ? "support" : "promotions";
              setActiveModule(target);
              setSearchResults([]);
              setGlobalQuery("");
            }}><StatusBadge value={result.entity_type} /><span><strong>{result.title}</strong><small>{result.subtitle}</small></span></button>,
          )}</div>}
        </div>
        <div className="admin-top-actions"><span className="secure-indicator">● Sécurisé</span><button aria-label="Ouvrir le journal d’audit" onClick={() => setActiveModule("audit")}>◌</button></div>
      </header>
      <div className="admin-page">
        {notice && <div className="admin-toast" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        <div className="admin-page-heading"><div><p>Mata Beauty · Administration</p><h1>{current.label}</h1></div><div className="admin-page-actions"><button className="primary" onClick={() => window.location.reload()}>Actualiser</button></div></div>
        <AdminModule module={effectiveModule} context={context} setModule={setActiveModule} notify={setNotice} />
      </div>
    </section>
  </main>;
}

function AdminLogin({ onAuthenticated, configured }: { onAuthenticated: () => Promise<void>; configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setFeedback("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setFeedback("Connexion refusée. Vérifiez vos identifiants administrateur.");
      setBusy(false);
      return;
    }
    await onAuthenticated();
    setBusy(false);
  }

  return <main className="admin-auth-shell">
    <section className="admin-login-card">
      <div className="admin-login-brand"><Image src="/brand/mata-app-icon.webp" alt="" width={52} height={52} unoptimized /><div><strong>MATA BEAUTY</strong><small>SUPER ADMINISTRATION</small></div></div>
      <p className="admin-kicker">Accès restreint</p>
      <h1>Centre de contrôle</h1>
      <p>Authentification réservée aux équipes autorisées. Chaque connexion et action sensible est journalisée.</p>
      {!configured && <div className="admin-auth-error">Configuration sécurisée indisponible.</div>}
      <form onSubmit={submit}>
        <label>Adresse administrateur<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Mot de passe<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
        {feedback && <p className="admin-auth-error" role="alert">{feedback}</p>}
        <button className="primary" disabled={!configured || busy}>{busy ? "Vérification…" : "Accéder à l’administration"}</button>
      </form>
      <small className="admin-security-note">⌾ Protection RLS · permissions granulaires · MFA compatible</small>
    </section>
  </main>;
}

function AccessDenied({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return <main className="admin-auth-shell"><section className="admin-login-card denied">
    <span className="denied-icon">×</span><p className="admin-kicker">Accès refusé</p><h1>Compte non autorisé</h1>
    <p>Votre compte ne dispose d’aucun rôle administratif actif. Aucun contenu sensible n’a été chargé.</p>
    <button className="primary" onClick={() => void onSignOut()}>Revenir à la connexion</button>
  </section></main>;
}

function AdminModule({
  module, context, setModule, notify,
}: {
  module: ModuleKey;
  context: AdminContext;
  setModule: (module: ModuleKey) => void;
  notify: (message: string) => void;
}) {
  if (module === "overview" || module === "statistics") return <Overview context={context} setModule={setModule} />;
  if (module === "users") return <UsersModule context={context} notify={notify} />;
  if (module === "providers" || module === "verification") return <ProvidersModule context={context} verificationOnly={module === "verification"} notify={notify} />;
  if (module === "bookings" || module === "calendar") return <BookingsModule context={context} calendar={module === "calendar"} notify={notify} />;
  if (module === "categories" || module === "services") return <CatalogModule services={module === "services"} notify={notify} />;
  if (module === "payments" || module === "commissions" || module === "payouts") return <FinanceModule section={module} />;
  if (module === "content") return <SocialContentModule context={context} notify={notify} />;
  if (module === "audit") return <AuditModule context={context} />;
  if (module === "settings" || module === "maintenance") return <SettingsModule maintenance={module === "maintenance"} notify={notify} />;
  return <OperationalModule module={module} context={context} />;
}

function Overview({ context, setModule }: { context: AdminContext; setModule: (module: ModuleKey) => void }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  useEffect(() => {
    void getSupabaseBrowserClient()?.rpc("get_admin_dashboard").then(({ data }) => setMetrics(data as Metrics | null));
  }, []);
  if (!metrics) return <LoadingSkeleton />;
  const bookingTotal = metrics.bookings_confirmed + metrics.bookings_cancelled;
  const cancellationRate = bookingTotal ? Math.round((metrics.bookings_cancelled / bookingTotal) * 100) : 0;
  return <>
    <section className="admin-metric-grid">{metricDefinitions.map((definition) =>
      <article className={definition.tone ?? ""} key={definition.key}><small>{definition.label}</small><strong>{definition.currency ? formatCurrency(metrics[definition.key]) : metrics[definition.key]}</strong><span>↗ Données Supabase</span></article>,
    )}</section>
    <section className="admin-dashboard-grid">
      <article className="admin-panel admin-chart-panel"><div className="admin-panel-heading"><div><p>Activité réelle</p><h2>Réservations enregistrées</h2></div></div>
        <dl className="admin-kpi-list"><div><dt>Cette semaine</dt><dd>{metrics.bookings_week}</dd></div><div><dt>Confirmées</dt><dd>{metrics.bookings_confirmed}</dd></div><div><dt>Annulées</dt><dd>{metrics.bookings_cancelled}</dd></div></dl>
      </article>
      <article className="admin-panel"><div className="admin-panel-heading"><div><p>Qualité opérationnelle</p><h2>Indicateurs clés</h2></div></div>
        <dl className="admin-kpi-list"><div><dt>Taux d’annulation</dt><dd>{cancellationRate}%</dd></div><div><dt>Panier moyen</dt><dd>{formatCurrency(metrics.average_order)}</dd></div><div><dt>Nouveaux comptes semaine</dt><dd>{metrics.users_week}</dd></div></dl>
      </article>
      <article className="admin-panel urgent-panel"><div className="admin-panel-heading"><div><p>À traiter</p><h2>Alertes opérationnelles</h2></div></div>
        <PermissionGuard permission="documents.review" context={context}><button onClick={() => setModule("verification")}><span>Validations prestataires</span><strong>{metrics.providers_pending}</strong></button></PermissionGuard>
        <PermissionGuard permission="reports.manage" context={context}><button onClick={() => setModule("reports")}><span>Signalements ouverts</span><strong>{metrics.reports_open}</strong></button></PermissionGuard>
        <PermissionGuard permission="reports.manage" context={context}><button onClick={() => setModule("disputes")}><span>Litiges ouverts</span><strong>{metrics.disputes_open}</strong></button></PermissionGuard>
        <PermissionGuard permission="support.manage" context={context}><button onClick={() => setModule("support")}><span>Tickets support</span><strong>{metrics.tickets_open}</strong></button></PermissionGuard>
      </article>
    </section>
    <PermissionGuard permission="settings.update" context={context}><div className="admin-security-banner"><span>⌾</span><div><strong>Contrôles sensibles actifs</strong><p>Les suspensions, validations, changements de rôle, réservations et paramètres exigent une justification et créent un journal d’audit.</p></div></div></PermissionGuard>
  </>;
}

function UsersModule({ context, notify }: { context: AdminContext; notify: (message: string) => void }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [confirmation, setConfirmation] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await getSupabaseBrowserClient()!.rpc("admin_list_users", { search_term: query || null });
    setRows((data ?? []) as UserRow[]);
    setLoading(false);
  }, [query]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const visible = useMemo(() => rows.filter((row) => roleFilter === "all" || row.account_role === roleFilter), [roleFilter, rows]);

  return <>
    <div className="admin-filter-bar"><div className="admin-inline-search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, e-mail ou téléphone" /></div><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">Tous les rôles</option><option value="client">Clients</option><option value="provider">Prestataires</option><option value="admin">Administrateurs</option></select><span>{visible.length} comptes</span></div>
    {loading ? <LoadingSkeleton /> : <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Ville</th><th>Inscription</th><th>Activité</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{visible.map((row) =>
      <tr key={row.user_id}><td><strong>{row.display_name || "Sans nom"}</strong><small>{row.email}<br />{row.phone || "Téléphone non renseigné"}</small></td><td><StatusBadge value={row.account_role} /></td><td>{row.city || "—"}</td><td>{formatDate(row.created_at)}<small>Dernière connexion : {formatDate(row.last_sign_in_at)}</small></td><td>{row.bookings_count} réservation(s)<small>{row.reports_count} signalement(s)</small></td><td><StatusBadge value={row.is_suspended ? "suspended" : "active"} /></td><td><PermissionGuard permission="users.suspend" context={context}><button className={row.is_suspended ? "table-action positive" : "table-action danger"} onClick={() => setConfirmation(row)}>{row.is_suspended ? "Réactiver" : "Suspendre"}</button></PermissionGuard></td></tr>,
    )}</tbody></table></div>}
    {confirmation && <ConfirmationModal title={confirmation.is_suspended ? "Réactiver ce compte ?" : "Suspendre ce compte ?"} description={`${confirmation.display_name || confirmation.email} sera ${confirmation.is_suspended ? "de nouveau autorisé" : "immédiatement bloqué"}.`} dangerous={!confirmation.is_suspended} onCancel={() => setConfirmation(null)} onConfirm={async (reason) => {
      const { error } = await getSupabaseBrowserClient()!.rpc("admin_set_user_suspension", { target_user_id: confirmation.user_id, suspended: !confirmation.is_suspended, reason });
      if (error) notify(publicErrorMessage(error, "Le compte n’a pas pu être mis à jour.")); else notify("Compte mis à jour et action journalisée.");
      setConfirmation(null);
      await load();
    }} />}
  </>;
}

function ProvidersModule({ context, verificationOnly, notify }: { context: AdminContext; verificationOnly: boolean; notify: (message: string) => void }) {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<{ row: ProviderRow; status: "approved" | "rejected" | "suspended" } | null>(null);
  const load = useCallback(async () => {
    let request = getSupabaseBrowserClient()!.from("provider_profiles").select("profile_id,business_name,city,status,average_rating,review_count,created_at").order("created_at", { ascending: false }).limit(200);
    if (verificationOnly) request = request.eq("status", "pending_review");
    const { data } = await request;
    setRows((data ?? []) as ProviderRow[]);
    setLoading(false);
  }, [verificationOnly]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  if (loading) return <LoadingSkeleton />;
  return <><div className="admin-filter-bar"><span>{rows.length} prestataires autorisés</span></div>
    {rows.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Prestataire</th><th>Ville</th><th>Note</th><th>Inscription</th><th>Statut</th><th>Décision</th></tr></thead><tbody>{rows.map((row) =>
      <tr key={row.profile_id}><td><strong>{row.business_name}</strong><small>{row.profile_id.slice(0, 8)}</small></td><td>{row.city}</td><td>★ {Number(row.average_rating).toFixed(1)}<small>{row.review_count} avis</small></td><td>{formatDate(row.created_at)}</td><td><StatusBadge value={row.status} /></td><td><PermissionGuard permission="providers.verify" context={context}><button className="table-action positive" onClick={() => setConfirmation({ row, status: "approved" })}>Approuver</button><button className="table-action danger" onClick={() => setConfirmation({ row, status: "rejected" })}>Rejeter</button></PermissionGuard><PermissionGuard permission="providers.suspend" context={context}><button className="table-action danger" onClick={() => setConfirmation({ row, status: "suspended" })}>Suspendre</button></PermissionGuard></td></tr>,
    )}</tbody></table></div> : <EmptyState title="File de vérification à jour" description="Aucun prestataire ne correspond aux filtres sélectionnés." />}
    {confirmation && <ConfirmationModal title={`${confirmation.status === "approved" ? "Approuver" : confirmation.status === "rejected" ? "Rejeter" : "Suspendre"} ${confirmation.row.business_name} ?`} description="La décision sera appliquée immédiatement et enregistrée dans le journal d’audit." dangerous={confirmation.status !== "approved"} onCancel={() => setConfirmation(null)} onConfirm={async (reason) => {
      const { error } = await getSupabaseBrowserClient()!.rpc("admin_set_provider_status", { target_provider_id: confirmation.row.profile_id, next_status: confirmation.status, reason });
      notify(error ? publicErrorMessage(error, "La décision n’a pas pu être appliquée.") : "Décision appliquée et journalisée.");
      setConfirmation(null);
      await load();
    }} />}
  </>;
}

function BookingsModule({ context, calendar, notify }: { context: AdminContext; calendar: boolean; notify: (message: string) => void }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [confirmation, setConfirmation] = useState<BookingRow | null>(null);
  useEffect(() => {
    void getSupabaseBrowserClient()!.from("bookings").select("id,starts_at,status,total_amount,currency,location_mode,provider_profiles(business_name),provider_services(title,duration_minutes)").order("starts_at", { ascending: false }).limit(200).then(({ data }) => setRows((data ?? []) as unknown as BookingRow[]));
  }, []);
  if (calendar) return <div className="admin-calendar"><div className="calendar-toolbar"><strong>Prochaines réservations</strong></div><div className="calendar-grid">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <strong key={day}>{day}</strong>)}{rows.slice(0, 14).map((row) => <article key={row.id}><small>{new Date(row.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" })}</small><span>{relationOne(row.provider_services)?.title || "Prestation"}</span><StatusBadge value={row.status} /></article>)}</div></div>;
  return <><div className="admin-filter-bar"><span>{rows.length} réservations autorisées</span></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Référence</th><th>Prestation</th><th>Prestataire</th><th>Date</th><th>Prix</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{rows.map((row) =>
    <tr key={row.id}><td><code>{row.id.slice(0, 8)}</code></td><td><strong>{relationOne(row.provider_services)?.title || "Prestation"}</strong><small>{relationOne(row.provider_services)?.duration_minutes || "—"} min · {row.location_mode}</small></td><td>{relationOne(row.provider_profiles)?.business_name || "—"}</td><td>{formatDate(row.starts_at)}</td><td>{formatCurrency(row.total_amount)}</td><td><StatusBadge value={row.status} /></td><td><PermissionGuard permission="bookings.update" context={context}><button className="table-action danger" onClick={() => setConfirmation(row)}>Modifier</button></PermissionGuard></td></tr>,
  )}</tbody></table></div>{confirmation && <ConfirmationModal title="Annuler administrativement cette réservation ?" description="Le statut sera modifié avec justification et les parties conserveront l’historique." dangerous onCancel={() => setConfirmation(null)} onConfirm={async (reason) => {
    const { error } = await getSupabaseBrowserClient()!.rpc("admin_update_booking_status", { target_booking_id: confirmation.id, next_status: "cancelled_by_provider", reason });
    notify(error ? publicErrorMessage(error, "La réservation n’a pas pu être mise à jour.") : "Réservation mise à jour et auditée.");
    setRows((current) => current.map((row) => row.id === confirmation.id ? { ...row, status: "cancelled_by_provider" } : row));
    setConfirmation(null);
  }} />}</>;
}

function CatalogModule({ services, notify }: { services: boolean; notify: (message: string) => void }) {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    const request = services
      ? getSupabaseBrowserClient()!.from("provider_services").select("id,title,is_active,duration_minutes,price_amount").order("created_at", { ascending: false }).limit(200)
      : getSupabaseBrowserClient()!.from("categories").select("id,name,slug,description,icon,image_url,parent_id,is_active,sort_order").order("sort_order");
    void request.then(({ data }) => setRows((data ?? []) as CatalogRow[]));
  }, [services]);
  useEffect(() => { load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "").trim();
    const slug = String(values.get("slug") ?? "").trim().toLowerCase();
    const { error } = await getSupabaseBrowserClient()!.rpc("admin_manage_category", {
      target_action: editing ? "update" : "create", target_category_id: editing?.id ?? null,
      target_name: name, target_slug: slug, target_description: String(values.get("description") ?? ""),
      target_icon: String(values.get("icon") ?? ""), target_image_url: String(values.get("imageUrl") ?? ""),
      target_parent_id: String(values.get("parentId") ?? "") || null,
      target_sort_order: Number(values.get("sortOrder") ?? 0), target_is_active: values.get("active") === "on",
    });
    setBusy(false);
    if (error) { notify(publicErrorMessage(error, "La catégorie n’a pas pu être enregistrée.")); return; }
    notify(editing ? "Catégorie modifiée et journalisée." : "Catégorie créée et disponible dans l’application.");
    setEditing(null); event.currentTarget.reset(); load();
  }

  async function action(row: CatalogRow, kind: "set_active" | "delete") {
    if (kind === "delete" && !window.confirm(`Supprimer « ${row.name} » ? Cette action sera refusée si des dépendances existent.`)) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient()!.rpc("admin_manage_category", {
      target_action: kind, target_category_id: row.id, target_name: null, target_slug: null,
      target_description: null, target_icon: null, target_image_url: null, target_parent_id: null,
      target_sort_order: row.sort_order ?? 0, target_is_active: kind === "set_active" ? !row.is_active : row.is_active,
    });
    setBusy(false);
    notify(error ? publicErrorMessage(error, "L’action n’a pas pu être appliquée.") : kind === "delete" ? "Catégorie supprimée et action auditée." : "Visibilité mise à jour.");
    if (!error) { setEditing(null); load(); }
  }

  if (services) return <><div className="admin-filter-bar"><span>{rows.length} prestations réelles · modification depuis l’espace prestataire</span></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Prestation</th><th>Durée</th><th>Prix</th><th>Statut</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.title}</strong></td><td>{row.duration_minutes} min</td><td>{formatCurrency(row.price_amount || 0)}</td><td><StatusBadge value={row.is_active ? "active" : "inactive"} /></td></tr>)}</tbody></table></div></>;

  const topLevel = rows.filter((row) => !row.parent_id && row.id !== editing?.id);
  return <>
    <form className="admin-catalog-form" onSubmit={save} key={editing?.id ?? "new"}>
      <header><div><p>Catalogue dynamique</p><h2>{editing ? "Modifier la catégorie" : "Créer une catégorie"}</h2></div>{editing && <button type="button" className="table-action" onClick={() => setEditing(null)}>Annuler</button>}</header>
      <label>Nom<input name="name" required minLength={2} maxLength={80} defaultValue={editing?.name ?? ""} /></label>
      <label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={editing?.slug ?? ""} /></label>
      <label>Icône<input name="icon" maxLength={80} defaultValue={editing?.icon ?? ""} /></label>
      <label>Ordre<input name="sortOrder" type="number" min={0} max={10000} defaultValue={editing?.sort_order ?? rows.length} /></label>
      <label>Catégorie parente<select name="parentId" defaultValue={editing?.parent_id ?? ""}><option value="">Aucune</option>{topLevel.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>URL de l’image<input name="imageUrl" type="url" defaultValue={editing?.image_url ?? ""} /></label>
      <label className="wide">Description<textarea name="description" maxLength={1000} defaultValue={editing?.description ?? ""} /></label>
      <label className="catalog-checkbox"><input name="active" type="checkbox" defaultChecked={editing?.is_active ?? true} /> Visible dans l’application</label>
      <button className="primary" disabled={busy}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer"}</button>
    </form>
    <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Catégorie</th><th>Slug</th><th>Parent</th><th>Ordre</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.icon} {row.name}</strong><small>{row.description || "Sans description"}</small></td><td>{row.slug}</td><td>{rows.find((parent) => parent.id === row.parent_id)?.name ?? "—"}</td><td>{row.sort_order}</td><td><StatusBadge value={row.is_active ? "active" : "inactive"} /></td><td><button className="table-action" onClick={() => setEditing(row)}>Modifier</button><button className="table-action" disabled={busy} onClick={() => void action(row, "set_active")}>{row.is_active ? "Masquer" : "Réactiver"}</button><button className="table-action danger" disabled={busy} onClick={() => void action(row, "delete")}>Supprimer</button></td></tr>)}</tbody></table></div>
  </>;
}

function FinanceModule({ section }: { section: "payments" | "commissions" | "payouts" }) {
  const [payments, setPayments] = useState<FinanceRow[]>([]);
  useEffect(() => {
    if (section === "payments") void getSupabaseBrowserClient()!.from("payments").select("id,booking_id,payment_status,payment_method,amount,currency,is_test,created_at").order("created_at", { ascending: false }).limit(200).then(({ data }) => setPayments((data ?? []) as FinanceRow[]));
  }, [section]);
  if (section !== "payments") return <OperationalFinance section={section} />;
  return <><div className="admin-filter-bar"><span>{payments.length} paiements · lecture sécurisée</span></div><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Référence</th><th>Réservation</th><th>Méthode</th><th>Montant</th><th>Date</th><th>Statut</th></tr></thead><tbody>{payments.map((row) => <tr key={row.id}><td><code>{row.id.slice(0, 8)}</code>{row.is_test && <small>Mode test</small>}</td><td><code>{row.booking_id.slice(0, 8)}</code></td><td>{row.payment_method}</td><td><strong>{formatCurrency(row.amount)}</strong></td><td>{formatDate(row.created_at)}</td><td><StatusBadge value={row.payment_status} /></td></tr>)}</tbody></table></div></>;
}

function OperationalFinance({ section }: { section: "commissions" | "payouts" }) {
  const [rules, setRules] = useState<CommissionRuleRow[]>([]);
  const [entries, setEntries] = useState<CommissionEntryRow[]>([]);
  useEffect(() => {
    if (section !== "commissions") return;
    const client = getSupabaseBrowserClient()!;
    void Promise.all([
      client.from("commission_rules").select("id,name,rate,is_active,valid_from,valid_until").order("valid_from", { ascending: false }),
      client.from("platform_commissions").select("id,payment_id,rate,amount,currency,created_at").order("created_at", { ascending: false }).limit(200),
    ]).then(([ruleResult, entryResult]) => {
      setRules((ruleResult.data ?? []) as CommissionRuleRow[]);
      setEntries((entryResult.data ?? []) as CommissionEntryRow[]);
    });
  }, [section]);
  if (section === "payouts") return <section className="admin-dashboard-grid"><article className="admin-panel"><p>Reversements</p><h2>Validation à quatre yeux</h2><p>La préparation du registre existe, mais aucun fournisseur de reversement réel n’est configuré. Aucune action financière fictive n’est exposée.</p></article></section>;
  const total = entries.reduce((sum, row) => sum + row.amount, 0);
  return <><section className="admin-metric-grid"><article><span>Commissions enregistrées</span><strong>{entries.length}</strong><small>Écritures réelles</small></article><article><span>Total Mata Beauty</span><strong>{formatCurrency(total)}</strong><small>Registre Supabase</small></article><article><span>Règles actives</span><strong>{rules.filter((row) => row.is_active).length}</strong><small>Calcul serveur</small></article></section><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Règle</th><th>Taux</th><th>Validité</th><th>Statut</th></tr></thead><tbody>{rules.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{Number(row.rate).toLocaleString("fr-FR")} %</td><td>{formatDate(row.valid_from)}<small>{row.valid_until ? `jusqu’au ${formatDate(row.valid_until)}` : "Sans échéance"}</small></td><td><StatusBadge value={row.is_active ? "active" : "inactive"} /></td></tr>)}</tbody></table></div><div className="admin-table-wrap commission-entries"><table className="admin-data-table"><thead><tr><th>Écriture</th><th>Paiement</th><th>Taux</th><th>Commission</th><th>Date</th></tr></thead><tbody>{entries.map((row) => <tr key={row.id}><td><code>{row.id.slice(0,8)}</code></td><td><code>{row.payment_id.slice(0,8)}</code></td><td>{Number(row.rate).toLocaleString("fr-FR")} %</td><td><strong>{formatCurrency(row.amount)}</strong></td><td>{formatDate(row.created_at)}</td></tr>)}</tbody></table></div></>;
}

function AuditModule({ context }: { context: AdminContext }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  useEffect(() => {
    if (context.is_super_admin || context.permissions.includes("audit.read")) void getSupabaseBrowserClient()!.from("audit_logs").select("id,action,entity_type,entity_id,after_data,created_at").order("created_at", { ascending: false }).limit(250).then(({ data }) => setRows((data ?? []) as AuditRow[]));
  }, [context]);
  return <><div className="admin-filter-bar"><span>Journal non modifiable · {rows.length} événements récents</span></div><div className="audit-timeline">{rows.map((row) => <article key={row.id}><i /><div><strong>{row.action}</strong><small>{row.entity_type} · {row.entity_id?.slice(0, 8) || "global"}</small><p>{typeof row.after_data?.justification === "string" ? row.after_data.justification : "Action système"}</p></div><time>{formatDate(row.created_at)}</time></article>)}</div></>;
}

function SocialContentModule({ context, notify }: { context: AdminContext; notify: (message: string) => void }) {
  const [rows, setRows] = useState<SocialPostRow[]>([]);
  const [metrics, setMetrics] = useState<SocialMetrics | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<{ row: SocialPostRow; action: "approve" | "hide" | "remove" | "restore" | "warn" | "feature" } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()!;
    const [{ data: postData }, { data: metricData }] = await Promise.all([
      supabase.from("posts").select("id,author_id,caption,status,post_type,thumbnail_url,is_sponsored,view_count,like_count,comment_count,share_count,published_at,created_at,provider_profiles!posts_author_id_fkey(business_name,city)").order("created_at", { ascending: false }).limit(250),
      supabase.rpc("get_social_admin_dashboard"),
    ]);
    setRows((postData ?? []) as unknown as SocialPostRow[]);
    setMetrics((metricData ?? null) as SocialMetrics | null);
    setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const visible = useMemo(() => rows.filter((row) =>
    (statusFilter === "all" || row.status === statusFilter) && (typeFilter === "all" || row.post_type === typeFilter),
  ), [rows, statusFilter, typeFilter]);

  if (loading) return <LoadingSkeleton />;
  return <>
    {metrics && <section className="admin-metric-grid">
      {[
        ["Publications aujourd’hui", metrics.posts_today], ["Publiées", metrics.published], ["À contrôler", metrics.pending],
        ["Signalées", metrics.reported], ["Vues", metrics.views], ["Réservations générées", metrics.bookings],
        ["Clics Réserver", metrics.booking_clicks], ["CA généré", formatCurrency(metrics.gross_amount)],
      ].map(([labelValue, value]) => <article key={String(labelValue)}><span>{labelValue}</span><strong>{typeof value === "number" ? value.toLocaleString("fr-FR") : value}</strong><small>Données Supabase</small></article>)}
    </section>}
    <div className="admin-filter-bar">
      <select aria-label="Filtrer par statut" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tous les statuts</option><option value="published">Publiées</option><option value="draft">Brouillons</option><option value="scheduled">Programmées</option><option value="hidden">Masquées</option><option value="deleted">Retirées</option></select>
      <select aria-label="Filtrer par format" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Tous les formats</option><option value="video">Vidéos</option><option value="photo">Photos</option><option value="before_after">Avant / Après</option><option value="promotion">Promotions</option><option value="availability">Disponibilités</option></select>
      <span>{visible.length} publication(s)</span>
    </div>
    {visible.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Publication</th><th>Créateur</th><th>Format</th><th>Performance</th><th>Statut</th><th>Modération</th></tr></thead><tbody>{visible.map((row) => {
      const provider = relationOne(row.provider_profiles);
      return <tr key={row.id}><td>{row.thumbnail_url ? <Image src={row.thumbnail_url} alt="" width={54} height={72} unoptimized /> : <strong>▶</strong>}<small>{row.caption.slice(0, 90) || "Sans légende"}<br />{formatDate(row.published_at ?? row.created_at)}</small></td><td><strong>{provider?.business_name ?? "Créateur"}</strong><small>{provider?.city ?? "Ville non renseignée"}</small></td><td><StatusBadge value={row.post_type} />{row.is_sponsored && <small> Sponsorisé</small>}</td><td>{Number(row.view_count).toLocaleString("fr-FR")} vues<small>{row.like_count} likes · {row.comment_count} commentaires · {row.share_count} partages</small></td><td><StatusBadge value={row.status} /></td><td>
        <PermissionGuard permission="content.manage" context={context}>
          {row.status !== "published" && row.status !== "deleted" && <button className="table-action positive" onClick={() => setConfirmation({ row, action: "approve" })}>Approuver</button>}
          {row.status === "published" && <><button className="table-action" onClick={() => setConfirmation({ row, action: "feature" })}>Mettre en avant</button><button className="table-action danger" onClick={() => setConfirmation({ row, action: "hide" })}>Masquer</button></>}
          {row.status !== "deleted" && <button className="table-action danger" onClick={() => setConfirmation({ row, action: "remove" })}>Retirer</button>}
          {row.status === "deleted" && <button className="table-action positive" onClick={() => setConfirmation({ row, action: "restore" })}>Restaurer</button>}
          <button className="table-action" onClick={() => setConfirmation({ row, action: "warn" })}>Avertir</button>
        </PermissionGuard>
      </td></tr>;
    })}</tbody></table></div> : <EmptyState title="Aucune publication" description="Aucun contenu ne correspond aux filtres sélectionnés." />}
    {confirmation && <ConfirmationModal
      title={`${confirmation.action === "feature" ? "Mettre en avant" : confirmation.action === "approve" ? "Approuver" : confirmation.action === "hide" ? "Masquer" : confirmation.action === "remove" ? "Retirer" : confirmation.action === "restore" ? "Restaurer" : "Avertir"} cette publication ?`}
      description="La décision sera appliquée côté serveur, transmise au créateur et inscrite dans le journal d’audit."
      dangerous={confirmation.action === "hide" || confirmation.action === "remove"}
      onCancel={() => setConfirmation(null)}
      onConfirm={async (reason) => {
        const supabase = getSupabaseBrowserClient()!;
        const result = confirmation.action === "feature"
          ? await supabase.rpc("admin_feature_social_post", { target_post_id: confirmation.row.id, target_feature_type: "recommended", target_starts_at: new Date().toISOString(), target_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(), target_position: null, target_audience: { type: "all" }, target_geographic_zone: null, reason })
          : await supabase.rpc("admin_moderate_social_post", { target_post_id: confirmation.row.id, decision: confirmation.action, reason });
        notify(result.error ? publicErrorMessage(result.error, "La décision de modération n’a pas pu être appliquée.") : confirmation.action === "feature" ? "Publication mise en avant pendant 7 jours." : "Décision appliquée et auditée.");
        setConfirmation(null);
        if (!result.error) await load();
      }}
    />}
  </>;
}

function SettingsModule({ maintenance, notify }: { maintenance: boolean; notify: (message: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("Mata Beauty revient très vite.");
  const [confirmation, setConfirmation] = useState(false);
  useEffect(() => {
    void getSupabaseBrowserClient()!.from("app_settings").select("value").eq("key", "maintenance").maybeSingle().then(({ data }) => {
      const value = data?.value as { enabled?: boolean; message?: string } | undefined;
      setEnabled(Boolean(value?.enabled));
      if (value?.message) setMessage(value.message);
    });
  }, []);
  if (!maintenance) return <div className="settings-grid">{["Application", "Réservations", "Commission globale", "Paiements", "Notifications", "Support", "Uploads", "Localisation"].map((title) => <article className="admin-panel" key={title}><p>Configuration</p><h2>{title}</h2><p>Lecture seule — édition non connectée dans cet écran.</p></article>)}</div>;
  return <><section className={`maintenance-control ${enabled ? "enabled" : ""}`}><span>△</span><div><p>Contrôle global</p><h2>Mode maintenance {enabled ? "actif" : "inactif"}</h2><p>Bloque temporairement les espaces clients et prestataires tout en laissant l’administration accessible.</p></div><button className={enabled ? "danger" : "primary"} onClick={() => setConfirmation(true)}>{enabled ? "Désactiver" : "Activer"}</button></section><article className="admin-panel maintenance-form"><label>Message public<textarea value={message} onChange={(event) => setMessage(event.target.value)} /></label><p>Administrateurs autorisés ; clients et prestataires bloqués pendant la maintenance.</p></article>{confirmation && <ConfirmationModal title={`${enabled ? "Désactiver" : "Activer"} le mode maintenance ?`} description="L’impact sur les utilisateurs est immédiat. Cette action sera journalisée." dangerous={!enabled} onCancel={() => setConfirmation(false)} onConfirm={async (reason) => {
    const next = { enabled: !enabled, message, allow_admins: true, allow_clients: false, allow_providers: false };
    const { error } = await getSupabaseBrowserClient()!.rpc("admin_update_setting", { setting_key: "maintenance", setting_value: next, reason });
    notify(error ? publicErrorMessage(error, "Le mode maintenance n’a pas pu être modifié.") : `Mode maintenance ${!enabled ? "activé" : "désactivé"}.`);
    if (!error) setEnabled(!enabled);
    setConfirmation(false);
  }} />}</>;
}

function OperationalModule({ module, context }: { module: ModuleKey; context: AdminContext }) {
  const descriptions: Partial<Record<ModuleKey, string>> = {
    salons: "Validation, équipes, coordonnées, prestations, revenus et incidents des salons.",
    reviews: "Modération des avis vérifiés liés aux réservations terminées.",
    reports: "File des signalements, priorités, assignations et décisions.",
    disputes: "Investigation des litiges et conservation complète des événements.",
    promotions: "Ciblage, limites, périodes et performances des promotions.",
    notifications: "Campagnes internes, e-mail, SMS et push avec prévisualisation.",
    support: "Tickets, priorités, assignations, messages et notes internes.",
    content: "Blocs éditoriaux, versions, brouillons et publications.",
    administrators: "Attribution contrôlée des rôles, MFA et sessions administratives.",
    roles: "Matrice des permissions granulaires et rôles système.",
    security: "Sessions, MFA, contrôles d’accès et alertes de sécurité.",
  };
  return <section className="admin-dashboard-grid"><article className="admin-panel span-two"><p>Module opérationnel</p><h2>{navigation.find((item) => item.key === module)?.label}</h2><p>{descriptions[module] || "Gestion centralisée avec données Supabase et contrôles RLS."}</p><div className="module-capabilities"><StatusBadge value="RLS actif" /><StatusBadge value="Audit actif" /><StatusBadge value={context.is_super_admin ? "Super Admin" : "Permission limitée"} /></div></article><article className="admin-panel"><p>État</p><h2>Aucune tâche urgente</h2><EmptyState title="File à jour" description="Les prochains éléments apparaîtront ici automatiquement." /></article></section>;
}
