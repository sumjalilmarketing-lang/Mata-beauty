Warning: truncated output (original token count: 19122)
Total output lines: 1006

"use client";
import { PasswordField } from "@/app/password-field";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient, getSupabaseConfiguration } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { ProviderReview } from "./provider-review";
import { OnboardingQueue } from "./onboarding-queue";
import { ManagedAccounts } from "./managed-accounts";
import { NotificationCenter, NotificationBadge } from "./notification-center";
import { LaunchAdmin } from "./launch-admin";
import { SupportInbox } from "./support-inbox";
import { ModerationInbox } from "./moderation-inbox";
import { InternalTeam } from "./internal-team";
import { CommentModeration } from "./comment-moderation";
import { isPlatformSettingKey, parsePlatformSetting, validatePlatformSetting, type PlatformSettingKey, type PlatformSettingValue, type PlatformSettingsMap } from "@/lib/domain/admin-platform-settings";

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
  bookings: number | null;
  gross_amount: number | null;
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
  { key: "launch", label: "Lancement", icon: "↗", permission: "users.read" },
  { key: "cohort", label: "Cohorte lancement", icon: "★", permission: "providers.read" },
  { key: "users", label: "Utilisateurs", icon: "◎", permission: "users.read" },
  { key: "providers", label: "Prestataires", icon: "✦", permission: "providers.read" },
  { key: "salons", label: "Salons", icon: "⌑", permission: "providers.read" },
  { key: "verification", label: "Validations professionnelles", icon: "✓", permission: "documents.review" },
  { key: "bookings", label: "Réservations", icon: "▣", permission: "bookings.read" },
  { key: "calendar", label: "Calendrier", icon: "□", permission: "bookings.read" },
  { key: "categories", label: "Catégories", icon: "◇", permission: "categories.manage" },
  { key: "services", label: "Prestations", icon: "≡", permission: "categories.manage" },
  { key: "payments", label: "Paiements", icon: "¤", permission: "payments.read" },
  { key: "commissions", label: "Commissions", icon: "%", permission: "commissions.manage" },
  { key: "payouts", label: "Reversements", icon: "↗", permission: "payouts.manage" },
  { key: "reviews", label: "Avis", icon: "★", permission: "reviews.moderate" },
  { key: "comments", label: "Commentaires", icon: "✉", permission: "reviews.moderate" },
  { key: "reports", label: "Signalements", icon: "!", permission: "reports.manage" },
  { key: "disputes", label: "Litiges", icon: "⚖", permission: "reports.manage" },
  { key: "promotions", label: "Promotions", icon: "◈", permission: "content.manage" },
  { key: "notifications", label: "Notifications", icon: "◌", permission: "notifications.send" },
  { key: "support", label: "Support", icon: "?", permission: "support.manage" },
  { key: "content", label: "Contenu social", icon: "▶", permission: "content.manage" },
  { key: "administrators", label: "Équipe & accès", icon: "♜", permission: "roles.manage" },
  { key: "roles", label: "Rôles et permissions", icon: "⌘", permission: "roles.manage" },
  { key: "statistics", label: "Statistiques", icon: "↗", permission: "users.read" },
  { key: "audit", label: "Journaux d’audit", icon: "≣", permission: "audit.read" },
  { key: "security", label: "Sécurité", icon: "⌾", permission: "roles.manage" },
  { key: "settings", label: "Paramètres", icon: "⚙", permission: "settings.read" },
  { key: "maintenance", label: "Maintenance", icon: "△", permission: "settings.update" },
  { key: "platform-health", label: "Santé plateforme", icon: "●", permission: "settings.read" },
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
  if (["launch", "cohort", "platform-health"].includes(key)) return false;
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

export function SuperAdminApp({ supabaseUrl, supabaseAnonKey, initialModule = "overview" }: { supabaseUrl: string; supabaseAnonKey: string; initialModule?: ModuleKey }) {
  configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey });
  const [context, setContext] = useState<AdminContext | null>(null);
  const [sessionState, setSessionState] = useState<"loading" | "anonymous" | "unauthorized" | "mfa" | "ready">("loading");
  const [activeModule, setActiveModule] = useState<ModuleKey>(initialModule);
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
      const mfa = await withTimeout(supabase.rpc("admin_mfa_required"));
      if (mfa.error) throw mfa.error;
      if (mfa.data === true) {
        setContext(null);
        setSessionState("mfa");
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
  if (sessionState === "mfa") return <AdminMfa onVerified={resolveSession} onSignOut={signOut} />;
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
        <div className="admin-top-actions"><span className="secure-indicator">● Sécurisé</span>{visibleNavigation.some(item => item.key === "notifications") && <button aria-label="Notifications" onClick={() => setActiveModule("notifications")}>◌<NotificationBadge /></button>}<button aria-label="Ouvrir le journal d’audit" onClick={() => setActiveModule("audit")}>≣</button></div>
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
        <label>Mot de passe<PasswordField autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
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
  if (module === "launch" || module === "cohort" || module === "platform-health") return <LaunchAdmin mode={module} />;
  if (module === "reports") return <ModerationInbox />;
  if (module === "comments") return <CommentModeration />;
  if (module === "support") return <SupportInbox />;
  if (module === "users") return context.is_super_admin ? <ManagedAccounts /> : <UsersModule context={context} notify={notify} />;
  if (module === "notifications") return <NotificationCenter />;
  if (module === "verification") return <OnboardingQueue moduleKey="dashboard" />;
  if (module === "providers") return <ProvidersModule context={context} verificationOnly={false} notify={notify} />;
  if (module === "bookings" || module === "calendar") return <BookingsModule context={context} calendar={module === "calendar"} notify={notify} />;
  if (module === "categories" || module === "services") return <CatalogModule services={module === "services"} notify={notify} />;
  if (module === "payments" || module === "commissions") retur…7122 tokens truncated…} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tous les statuts</option><option value="published">Publiées</option><option value="draft">Brouillons</option><option value="scheduled">Programmées</option><option value="hidden">Masquées</option><option value="deleted">Retirées</option></select>
      <select aria-label="Filtrer par format" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Tous les formats</option><option value="video">Vidéos</option><option value="photo">Photos</option><option value="before_after">Avant / Après</option><option value="promotion">Promotions</option><option value="availability">Disponibilités</option></select>
      <span>{visible.length} publication(s)</span>
    </div>
    {visible.length ? <div className="admin-table-wrap" role="region" aria-label="Publications" tabIndex={0}><table className="admin-data-table"><thead><tr><th>Publication</th><th>Créateur</th><th>Format</th><th>Performance</th><th>Statut</th><th>Modération</th></tr></thead><tbody>{visible.map((row) => {
      const provider = relationOne(row.provider_profiles);
      return <tr key={row.id}><td>{row.thumbnail_url ? <Image src={row.thumbnail_url} alt="" width={54} height={72} unoptimized /> : <strong>▶</strong>}<small>{row.caption.slice(0, 90) || "Sans légende"}<br />{formatDate(row.published_at ?? row.created_at)}</small></td><td><strong>{provider?.business_name ?? "Créateur"}</strong><small>{provider?.city ?? "Ville non renseignée"}</small></td><td><StatusBadge value={row.post_type} />{row.is_sponsored && <small> Sponsorisé</small>}</td><td>{Number(row.view_count).toLocaleString("fr-FR")} vues<small>{row.like_count} likes · {row.comment_count} commentaires · {row.share_count} partages</small></td><td><StatusBadge value={row.status} /></td><td>
        <PermissionGuard permission="content.manage" context={context}>
          {row.status !== "published" && row.status !== "deleted" && <button className="table-action positive" onClick={() => setConfirmation({ row, action: "approve" })}>Approuver</button>}
          {row.status === "published" && <><button className="table-action" onClick={() => setConfirmation({ row, action: "feature" })}>Mettre en avant</button><button className="table-action danger" onClick={() => setConfirmation({ row, action: "hide" })}>Masquer</button></>}
          {row.status === "published" && <button className="table-action positive" onClick={() => void toggleLaunchSelection(row)}>{launchSelected.has(row.id)?"✓ Sélection lancement":"Ajouter au lancement"}</button>}
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

function SettingsModule({ context, maintenance, notify }: { context: AdminContext; maintenance: boolean; notify: (message: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("Mata Beauty revient très vite.");
  const [confirmation, setConfirmation] = useState(false);
  const [settings, setSettings] = useState<{ key: string; description: string | null; value: unknown }[]>([]);
  const [drafts, setDrafts] = useState<Partial<PlatformSettingsMap>>({});
  const [settingToSave, setSettingToSave] = useState<PlatformSettingKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const canUpdate = context.is_super_admin || context.permissions.includes("settings.update");
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { setLoading(true); setError(""); });
    const client = getSupabaseBrowserClient();
    if (!client) {
      queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(false); setError("La connexion sécurisée aux paramètres est indisponible."); } });
      return () => controller.abort();
    }
    let query = client.from("app_settings").select("key,description,value");
    query = maintenance ? query.eq("key", "maintenance") : query.eq("is_sensitive", false);
    void query.order("key").abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])).then(({ data, error: failure }) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (failure) { setSettings([]); setError(publicErrorMessage(failure, "Les paramètres sont indisponibles.")); return; }
      setSettings(data ?? []);
      const nextDrafts: Partial<PlatformSettingsMap> = {};
      for (const row of data ?? []) {
        if (!isPlatformSettingKey(row.key)) continue;
        if (row.key === "application") {
          const parsed = parsePlatformSetting("application", row.value);
          if (parsed) nextDrafts.application = parsed;
        } else if (row.key === "booking") {
          const parsed = parsePlatformSetting("booking", row.value);
          if (parsed) nextDrafts.booking = parsed;
        } else {
          const parsed = parsePlatformSetting("support", row.value);
          if (parsed) nextDrafts.support = parsed;
        }
      }
      setDrafts(nextDrafts);
      const value = data?.find(row => row.key === "maintenance")?.value as { enabled?: boolean; message?: string } | undefined;
      setEnabled(Boolean(value?.enabled));
      if (value?.message) setMessage(value.message);
    });
    return () => controller.abort();
  }, [revision, maintenance]);

  function updateDraft<K extends PlatformSettingKey, F extends keyof PlatformSettingsMap[K]>(key: K, field: F, value: PlatformSettingsMap[K][F]) {
    setDrafts(previous => {
      const current = previous[key];
      if (!current) return previous;
      return { ...previous, [key]: { ...current, [field]: value } } as Partial<PlatformSettingsMap>;
    });
  }

  async function saveSetting(key: PlatformSettingKey, reason: string) {
    if (key !== "support") {
      notify("Ce réglage reste en lecture seule tant que le service ne l’applique pas.");
      setSettingToSave(null);
      return;
    }
    const value = drafts[key] as PlatformSettingValue | undefined;
    if (!value) { notify("Le réglage n’a pas pu être chargé ; actualisez la page avant de modifier."); return; }
    const invalid = validatePlatformSetting(key, value);
    if (invalid) { notify(invalid); setSettingToSave(null); return; }
    const client = getSupabaseBrowserClient();
    if (!client || !canUpdate) { notify("Votre rôle ne permet pas de modifier les paramètres globaux."); setSettingToSave(null); return; }
    try {
      const { error: saveError } = await client.rpc("admin_update_setting", { setting_key: key, setting_value: value, reason: reason.trim() });
      if (saveError) {
        notify(publicErrorMessage(saveError, "Le réglage n’a pas pu être enregistré."));
        setSettingToSave(null);
        return;
      }
      setSettingToSave(null);
      notify("Paramètre enregistré et inscrit au journal d’audit.");
      setRevision(current => current + 1);
    } catch (saveFailure) {
      notify(publicErrorMessage(saveFailure, "Le réglage n’a pas pu être enregistré."));
      setSettingToSave(null);
    }
  }

  const settingTitles: Record<PlatformSettingKey, string> = { application: "Identité et région", booking: "Règles de réservation", support: "Coordonnées support" };
  if (loading) return <p role="status">Chargement des paramètres…</p>;
  if (error) return <section><p role="alert">{error}</p><button onClick={() => setRevision(value => value + 1)}>Réessayer</button></section>;
  if (!maintenance) return <section className="admin-settings">
    <header className="admin-settings-header"><div><p className="admin-kicker">Configuration de la plateforme</p><h2>Paramètres généraux</h2><p>Les valeurs proviennent de <code>app_settings</code>. Les enregistrements sont contrôlés côté base et journalisés.</p></div><button className="secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Actualiser</button></header>
    {!canUpdate && <p className="admin-settings-readonly" role="status">Lecture seule : votre rôle ne possède pas la permission <code>settings.update</code>.</p>}
    <div className="admin-settings-note"><strong>État des réglages</strong><span>Les coordonnées support sont utilisées dans l’espace Aide. Le nom, la langue et la région restent informatifs, car l’application utilise actuellement une identité, une devise et un fuseau fixes. Les règles de réservation restent en lecture seule tant que le serveur ne les applique pas.</span></div>
    <div className="admin-settings-grid">
      {drafts.application && <article className="admin-panel admin-setting-card"><div className="admin-setting-heading"><div><p className="admin-kicker">Plateforme</p><h3>Identité et région</h3></div><span className="admin-setting-key">application</span></div><dl className="admin-settings-values">
        <div><dt>Nom de la plateforme</dt><dd>{drafts.application.name}</dd></div><div><dt>Langue disponible</dt><dd>{drafts.application.locale}</dd></div><div><dt>Pays</dt><dd>{drafts.application.country}</dd></div><div><dt>Devise</dt><dd>{drafts.application.currency}</dd></div><div><dt>Fuseau horaire</dt><dd>{drafts.application.timezone}</dd></div>
      </dl><p className="admin-setting-help">Informations de référence en lecture seule. Le produit utilise actuellement Mata Beauty, le français, le XOF et Africa/Dakar ; modifier ces métadonnées ne changerait ni l’interface ni les transactions.</p></article>}
      {drafts.booking && <article className="admin-panel admin-setting-card"><div className="admin-setting-heading"><div><p className="admin-kicker">Rendez-vous</p><h3>Règles de réservation</h3></div><span className="admin-setting-key">booking</span></div><dl className="admin-settings-values">
        <div><dt>Préavis minimum</dt><dd>{drafts.booking.minimum_notice_minutes} min</dd></div><div><dt>Délai d’annulation</dt><dd>{drafts.booking.cancellation_window_hours} h</dd></div>
      </dl><p className="admin-setting-help">Ces valeurs sont enregistrées dans la configuration, mais le serveur ne les applique pas encore. Elles sont donc en lecture seule et ne peuvent pas être présentées comme une règle active.</p></article>}
      {drafts.support && <article className="admin-panel admin-setting-card"><div className="admin-setting-heading"><div><p className="admin-kicker">Contact</p><h3>Coordonnées support</h3></div><span className="admin-setting-key">support</span></div><div className="admin-settings-fields">
        <label htmlFor="support-email">Adresse e-mail<input id="support-email" type="email" autoComplete="email" required value={drafts.support.email} disabled={!canUpdate} onChange={event => updateDraft("support", "email", event.target.value)} /></label>
        <label htmlFor="support-phone">Téléphone<input id="support-phone" type="tel" autoComplete="tel" maxLength={40} value={drafts.support.phone} disabled={!canUpdate} onChange={event => updateDraft("support", "phone", event.target.value)} /></label>
      </div><p className="admin-setting-help">Après enregistrement, ces coordonnées sont affichées dans la rubrique Aide de l’espace client.</p><PermissionGuard permission="settings.update" context={context}><div className="admin-setting-actions"><button className="primary" onClick={() => setSettingToSave("support")}>Enregistrer les coordonnées</button></div></PermissionGuard></article>}
      {!drafts.application && !drafts.booking && !drafts.support && <EmptyState title="Aucun réglage structuré disponible" description="Aucune des clés générales prises en charge par cette interface n’est présente." />}
    </div>
    {settings.some(setting => !isPlatformSettingKey(setting.key)) && <p className="admin-settings-readonly">Les autres réglages sont volontairement exclus de cette page structurée.</p>}
    {settingToSave && <ConfirmationModal title={`Enregistrer « ${settingTitles[settingToSave]} » ?`} description="L’enregistrement utilise la procédure d’administration existante. La base vérifiera settings.update et inscrira le motif au journal d’audit." onCancel={() => setSettingToSave(null)} onConfirm={reason => saveSetting(settingToSave, reason)} />}
  </section>;
  return <><section className={`maintenance-control ${enabled ? "enabled" : ""}`}><span>△</span><div><p>Contrôle global</p><h2>Mode maintenance {enabled ? "actif" : "inactif"}</h2><p>Bloque temporairement les espaces clients et prestataires tout en laissant l’administration accessible.</p></div><button className={enabled ? "danger" : "primary"} onClick={() => setConfirmation(true)}>{enabled ? "Désactiver" : "Activer"}</button></section><article className="admin-panel maintenance-form"><label>Message public<textarea value={message} onChange={(event) => setMessage(event.target.value)} /></label><p>Administrateurs autorisés ; clients et prestataires bloqués pendant la maintenance.</p></article>{confirmation && <ConfirmationModal title={`${enabled ? "Désactiver" : "Activer"} le mode maintenance ?`} description="L’impact sur les utilisateurs est immédiat. Cette action sera journalisée." dangerous={!enabled} onCancel={() => setConfirmation(false)} onConfirm={async (reason) => {
    const next = { enabled: !enabled, message, allow_admins: true, allow_clients: false, allow_providers: false };
    const { error } = await getSupabaseBrowserClient()!.rpc("admin_update_setting", { setting_key: "maintenance", setting_value: next, reason });
    notify(error ? publicErrorMessage(error, "Le mode maintenance n’a pas pu être modifié.") : `Mode maintenance ${!enabled ? "activé" : "désactivé"}.`);
    if (!error) setEnabled(!enabled);
    setConfirmation(false);
  }} />}</>;
}

type OperationalRow = Record<string, unknown>;
const operationalSources: Partial<Record<ModuleKey, { table: string; select: string; description: string; title: (row: OperationalRow) => string; detail: (row: OperationalRow) => string }>> = {
  payouts: { table: "payouts", select: "id,provider_id,amount,currency,status,created_at", description: "Versements enregistrés, en lecture seule. Aucun transfert réel n’est activé en mode mock.", title: row => `${formatCurrency(Number(row.amount))} · ${String(row.status)}`, detail: row => `Professionnel ${String(row.provider_id).slice(0, 8)} · ${formatDate(String(row.created_at))}` },
  salons: { table: "businesses", select: "id,name,city,status,created_at", description: "Salons enregistrés et leur statut.", title: row => String(row.name), detail: row => `${row.city ?? ""} · ${row.status}` },
  reviews: { table: "reviews", select: "id,rating,comment,is_visible,created_at", description: "Avis liés aux réservations terminées. Le texte de l’auteur est conservé.", title: row => `${row.rating}/5 · ${row.comment ?? "Sans commentaire"}`, detail: row => row.is_visible ? "Visible" : "Masqué" },
  disputes: { table: "disputes", select: "id,reason,status,priority,created_at", description: "Registre des litiges enregistrés, en lecture seule.", title: row => String(row.reason), detail: row => `${row.status} · ${row.priority}` },
  promotions: { table: "promotions", select: "id,title,status,is_active,created_at", description: "Promotions enregistrées, en lecture seule. Les brouillons se préparent dans Lancement.", title: row => String(row.title), detail: row => `${row.status} · ${row.is_active ? "Active" : "Inactive"}` },
  security: { table: "admin_sessions", select: "id,user_id,mfa_verified,revoked_at,signed_in_at,last_seen_at", description: "Sessions administratives enregistrées. Les révocations se gèrent dans Équipe & accès.", title: row => `Compte ${String(row.user_id).slice(0, 8)}`, detail: row => `${row.revoked_at ? "Révoquée" : "Enregistrée"} · MFA ${row.mfa_verified ? "vérifié" : "non vérifié"}` },
};

function OperationalModule({ module, context }: { module: ModuleKey; context: AdminContext }) {
  const source = operationalSources[module];
  const [rows, setRows] = useState<OperationalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const client = getSupabaseBrowserClient(); if (!client || !source) throw new Error("Source indisponible");
      const result = await client.from(source.table).select(source.select).order(module === "security" ? "signed_in_at" : "created_at", { ascending: false }).limit(100).abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      setRows((result.data ?? []) as unknown as OperationalRow[]);
    } catch (error) { setRows([]); setNotice(publicErrorMessage(error, "Les données sont indisponibles.")); }
    finally { setLoading(false); }
  }, [source, module]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function moderate(row: OperationalRow) {
    if (busy || !window.confirm(`${row.is_visible ? "Masquer" : "Restaurer"} cet avis ?`)) return;
    setBusy(true);
    try {
      const result = await getSupabaseBrowserClient()!.from("reviews").update({ is_visible: !row.is_visible }).eq("id", String(row.id)).eq("is_visible", Boolean(row.is_visible)).select("id").abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      if (result.data.length !== 1) throw new Error("L’avis ou vos droits ont changé. Actualisez la liste.");
      await load(); setNotice("Visibilité de l’avis mise à jour.");
    } catch (error) { setNotice(publicErrorMessage(error, "La visibilité de l’avis n’a pas été modifiée.")); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel"><h2>{navigation.find(item => item.key === module)?.label}</h2><p>{source?.description}</p><button disabled={loading || busy} onClick={() => void load()}>Actualiser le registre</button>{notice && <p role="status">{notice}</p>}{loading ? <p>Chargement…</p> : rows.length ? rows.map(row => <article className="control-list-row" key={String(row.id)}><div><strong>{source?.title(row)}</strong><p>{source?.detail(row)}</p></div>{module === "reviews" && (context.is_super_admin || context.permissions.includes("reviews.moderate")) && <button disabled={busy} onClick={() => void moderate(row)}>{row.is_visible ? "Masquer l’avis" : "Restaurer l’avis"}</button>}</article>) : !notice && <p>Aucun élément dans le périmètre autorisé.</p>}</section>;
}
function AdminMfa({ onVerified, onSignOut }: { onVerified: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  async function prepare() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true); setFeedback("");
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const existing = factors.data.totp.find(factor => factor.status === "verified");
      if (existing) { setFactorId(existing.id); return; }
      // Remove only incomplete enrollments before restarting this setup.
      for (const factor of factors.data.all.filter(factor => factor.factor_type === "totp" && factor.status === "unverified")) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) throw removed.error;
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MATA Beauty administration" });
      if (enrolled.error) throw enrolled.error;
      setFactorId(enrolled.data.id); setQrCode(enrolled.data.totp.qr_code);
    } catch { setFeedback("Impossible de préparer la vérification. Réessayez."); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !factorId) return;
    setBusy(true); setFeedback("");
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) { setFeedback("Code invalide ou expiré. Saisissez le code actuel."); return; }
      setQrCode(""); setCode("");
      await onVerified();
    } catch { setFeedback("Vérification indisponible. Réessayez."); }
    finally { setBusy(false); }
  }
  return <main className="admin-auth-shell"><section className="admin-login-card">
    <h1>Vérification en deux étapes</h1>
    <p>Votre rôle exige un second facteur avant tout accès administratif.</p>
    {!factorId ? <button className="primary" disabled={busy} onClick={() => void prepare()}>{busy ? "Préparation…" : "Préparer la vérification"}</button> : <form onSubmit={event => void verify(event)}>
      {qrCode && <><p>Scannez ce code avec votre application d’authentification, puis saisissez le code à six chiffres.</p><Image src={qrCode} alt="Code QR de configuration du second facteur" width={220} height={220} unoptimized /></>}
      <label>Code d’authentification<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
      <button className="primary" disabled={busy || code.length !== 6}>{busy ? "Vérification…" : "Vérifier le code"}</button>
    </form>}
    {feedback && <p role="alert">{feedback}</p>}
    <button className="secondary" disabled={busy} onClick={() => void onSignOut()}>Se déconnecter</button>
  </section></main>;
}

