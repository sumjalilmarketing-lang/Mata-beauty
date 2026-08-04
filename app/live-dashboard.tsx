"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { canTransitionBooking, type BookingStatus } from "@/lib/domain/booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BookingMessages } from "./booking-messages";
import { VideoPublisher } from "./video-publisher";

type Role = "client" | "provider" | "admin";
type ProviderStatus = "draft" | "pending_review" | "approved" | "rejected" | "suspended";
type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  total_amount: number;
  currency: string;
  location_mode: "salon" | "client_address";
  appointment_address: string | null;
  provider_services: { title: string; duration_minutes: number } | null;
};
type BookingQueryRow = Omit<BookingRow, "provider_services"> & {
  provider_services: BookingRow["provider_services"] | Array<NonNullable<BookingRow["provider_services"]>>;
};
type NotificationRow = {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
type ProviderProfileRow = {
  profile_id: string;
  business_name: string;
  bio: string | null;
  city: string;
  service_mode: "salon" | "mobile" | "both";
  status: ProviderStatus;
  activity_type: "independent" | "salon" | "barber_shop" | "makeup_artist" | "hairdresser" | "nail_artist" | "esthetician" | "care_specialist" | "other";
  years_experience: number;
  base_address: string | null;
  languages: string[];
  cancellation_policy: string | null;
  onboarding_progress: number;
};
type ClientAccountRow = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  marketing_consent: boolean;
  city: string | null;
  default_address: string | null;
  preferences: Record<string, unknown>;
};
type PendingProviderRow = {
  profile_id: string;
  business_name: string;
  city: string;
  status: ProviderStatus;
  created_at: string;
};
type BaseServiceRow = {
  id: string;
  name: string;
};

const providerStatusLabels: Record<ProviderStatus, string> = {
  draft: "Brouillon",
  pending_review: "En cours de validation",
  approved: "Profil publié",
  rejected: "À corriger",
  suspended: "Suspendu",
};

export function LiveDashboard({
  role,
  userId,
  displayName,
  onBack,
  onSignOut,
}: {
  role: Role;
  userId: string;
  displayName: string;
  onBack: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [providerProfile, setProviderProfile] = useState<ProviderProfileRow | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientAccountRow | null>(null);
  const [pendingProviders, setPendingProviders] = useState<PendingProviderRow[]>([]);
  const [baseServices, setBaseServices] = useState<BaseServiceRow[]>([]);
  const [adminMetrics, setAdminMetrics] = useState({ users: 0, providersPending: 0, reportsOpen: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [messageBooking, setMessageBooking] = useState<BookingRow | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase n’est pas configuré.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (role === "admin") {
        const [users, pending, reports, providerRows] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("provider_profiles").select("profile_id", { count: "exact", head: true }).eq("status", "pending_review"),
          supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
          supabase
            .from("provider_profiles")
            .select("profile_id,business_name,city,status,created_at")
            .eq("status", "pending_review")
            .order("created_at", { ascending: true }),
        ]);
        const firstError = users.error ?? pending.error ?? reports.error ?? providerRows.error;
        if (firstError) throw firstError;
        setAdminMetrics({
          users: users.count ?? 0,
          providersPending: pending.count ?? 0,
          reportsOpen: reports.count ?? 0,
        });
        setPendingProviders((providerRows.data ?? []) as PendingProviderRow[]);
      } else {
        const ownerColumn = role === "client" ? "client_id" : "provider_id";
        const { data, error: bookingError } = await supabase
          .from("bookings")
          .select("id,starts_at,ends_at,status,total_amount,currency,location_mode,appointment_address,provider_services(title,duration_minutes)")
          .eq(ownerColumn, userId)
          .order("starts_at", { ascending: true })
          .limit(30);
        if (bookingError) throw bookingError;
        const rows = (data ?? []) as unknown as BookingQueryRow[];
        setBookings(rows.map((booking) => ({
          ...booking,
          provider_services: Array.isArray(booking.provider_services) ? booking.provider_services[0] ?? null : booking.provider_services,
        })));

        if (role === "client") {
          const [accountResult, clientResult] = await Promise.all([
            supabase.from("profiles").select("first_name,last_name,phone,marketing_consent").eq("id", userId).single(),
            supabase.from("client_profiles").select("city,default_address,preferences").eq("profile_id", userId).single(),
          ]);
          if (accountResult.error) throw accountResult.error;
          if (clientResult.error) throw clientResult.error;
          setClientProfile({ ...accountResult.data, ...clientResult.data } as ClientAccountRow);
        }

        if (role === "provider") {
          const [profileResult, serviceResult] = await Promise.all([
            supabase
              .from("provider_profiles")
              .select("profile_id,business_name,bio,city,service_mode,status,activity_type,years_experience,base_address,languages,cancellation_policy,onboarding_progress")
              .eq("profile_id", userId)
              .maybeSingle(),
            supabase.from("services").select("id,name").eq("is_active", true).order("name"),
          ]);
          if (profileResult.error) throw profileResult.error;
          if (serviceResult.error) throw serviceResult.error;
          setProviderProfile(profileResult.data as ProviderProfileRow | null);
          setBaseServices((serviceResult.data ?? []) as BaseServiceRow[]);
        }
      }
      const { data: notificationData, error: notificationError } = await supabase
        .from("notifications")
        .select("id,title,body,read_at,created_at")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (notificationError) throw notificationError;
      setNotifications((notificationData ?? []) as NotificationRow[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de charger le tableau de bord.");
    } finally {
      setLoading(false);
    }
  }, [role, userId]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const metrics = useMemo(() => {
    if (role === "admin") {
      return [
        [String(adminMetrics.users), "Utilisateurs"],
        [String(adminMetrics.providersPending), "Validations en attente"],
        [String(adminMetrics.reportsOpen), "Signalements ouverts"],
      ];
    }
    const confirmed = bookings.filter((booking) => booking.status === "confirmed").length;
    const completed = bookings.filter((booking) => booking.status === "completed");
    const revenue = completed.reduce((sum, booking) => sum + booking.total_amount, 0);
    return role === "provider"
      ? [[String(bookings.length), "Réservations"], [String(confirmed), "Confirmées"], [`${revenue.toLocaleString("fr-FR")} F`, "Revenus théoriques"]]
      : [[String(bookings.filter((booking) => new Date(booking.starts_at) >= new Date()).length), "À venir"], [String(completed.length), "Terminées"], [String(notifications.filter((item) => !item.read_at).length), "Notifications non lues"]];
  }, [adminMetrics, bookings, notifications, role]);

  async function updateStatus(booking: BookingRow, status: BookingStatus) {
    if (!canTransitionBooking(booking.status, status)) {
      setFeedback("Cette transition de statut est interdite.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setFeedback("");
    const { error: updateError } = await supabase.from("bookings").update({ status }).eq("id", booking.id);
    if (updateError) {
      setFeedback(updateError.message);
      return;
    }
    setFeedback("Réservation mise à jour.");
    await load();
  }

  async function saveProviderProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const formData = new FormData(event.currentTarget);
    const businessName = String(formData.get("businessName") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const serviceMode = String(formData.get("serviceMode") ?? "salon");
    const activityType = String(formData.get("activityType") ?? "independent");
    const yearsExperience = Number(formData.get("yearsExperience"));
    const baseAddress = String(formData.get("baseAddress") ?? "").trim();
    const languages = String(formData.get("languages") ?? "fr").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    const cancellationPolicy = String(formData.get("cancellationPolicy") ?? "").trim();
    if (!businessName || !city || !["salon", "mobile", "both"].includes(serviceMode)) {
      setFeedback("Le nom, la ville et le mode de prestation sont obligatoires.");
      return;
    }
    const { data: progress, error: updateError } = await supabase.rpc("save_professional_onboarding", {
      target_business_name: businessName, target_bio: bio, target_city: city, target_service_mode: serviceMode,
      target_activity_type: activityType, target_years_experience: yearsExperience, target_base_address: baseAddress,
      target_languages: languages, target_cancellation_policy: cancellationPolicy,
    });
    if (updateError) setFeedback(updateError.message);
    else {
      setFeedback(`Brouillon enregistré · progression ${progress ?? 0} %.`);
      await load();
    }
  }

  async function saveClientProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const formData = new FormData(event.currentTarget);
    const preferences = String(formData.get("preferences") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const { error: updateError } = await supabase.rpc("save_client_profile", {
      target_first_name: String(formData.get("firstName") ?? ""), target_last_name: String(formData.get("lastName") ?? ""),
      target_phone: String(formData.get("phone") ?? ""), target_city: String(formData.get("city") ?? ""),
      target_address: String(formData.get("address") ?? ""), target_preferences: { categories: preferences },
      target_marketing_consent: formData.get("marketingConsent") === "on",
    });
    if (updateError) setFeedback(updateError.message);
    else { setFeedback("Votre profil client est enregistré."); await load(); }
  }

  async function submitProviderForReview() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error: rpcError } = await supabase.rpc("submit_provider_for_review");
    if (rpcError) setFeedback(rpcError.message);
    else {
      setFeedback("Votre profil a été envoyé à l’équipe Mata Beauty.");
      await load();
    }
  }

  async function addProviderService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const serviceId = String(formData.get("serviceId") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const durationMinutes = Number(formData.get("durationMinutes"));
    const priceAmount = Number(formData.get("priceAmount"));
    const { error: insertError } = await supabase.from("provider_services").insert({
      provider_id: userId,
      service_id: serviceId,
      title,
      duration_minutes: durationMinutes,
      price_amount: priceAmount,
      currency: "XOF",
    });
    if (insertError) setFeedback(insertError.message);
    else {
      form.reset();
      setFeedback("Prestation ajoutée.");
    }
  }

  async function moderateProvider(profileId: string, decision: "approved" | "rejected") {
    const action = decision === "approved" ? "approuver" : "refuser";
    if (!window.confirm(`Confirmer : ${action} ce profil prestataire ?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("provider_profiles")
      .update({ status: decision, verified_at: decision === "approved" ? new Date().toISOString() : null })
      .eq("profile_id", profileId)
      .eq("status", "pending_review");
    if (updateError) setFeedback(updateError.message);
    else {
      setFeedback(decision === "approved" ? "Prestataire approuvé et publié." : "Profil renvoyé pour correction.");
      await load();
    }
  }

  async function markNotificationRead(notificationId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("profile_id", userId);
    if (updateError) setFeedback(updateError.message);
    else await load();
  }

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={onBack}><span className="brand-mark">M</span><span>Mata <i>Beauty</i></span></button>
        <p className="role-pill">Espace {role}</p>
        <nav>
          <button className="active" onClick={() => void load()}>⌂ Vue d’ensemble</button>
          {role !== "admin" && <button onClick={() => document.getElementById("live-bookings")?.scrollIntoView({ behavior: "smooth" })}>▣ Réservations</button>}
          {role !== "admin" && <button onClick={() => document.getElementById(messageBooking ? "booking-conversation" : "live-bookings")?.scrollIntoView({ behavior: "smooth" })}>✉ Messages</button>}
          <button onClick={() => document.getElementById("live-notifications")?.scrollIntoView({ behavior: "smooth" })}>◌ Notifications <i>{notifications.filter((item) => !item.read_at).length}</i></button>
        </nav>
        <button className="back-link" onClick={() => void onSignOut()}>Se déconnecter</button>
      </aside>
      <section className="dashboard-main">
        <div className="dashboard-top">
          <div><p className="eyebrow">Données Supabase</p><h1>Bonjour, {displayName} 👋</h1><p>Les informations ci-dessous proviennent de votre compte connecté.</p></div>
          <span className="live-badge">Connecté</span>
        </div>
        {feedback && <p className="dashboard-feedback" role="status">{feedback}</p>}
        {error && <div className="dashboard-error" role="alert"><p>{error}</p><button className="outline-button" onClick={() => void load()}>Réessayer</button></div>}
        {loading ? (
          <div className="metric-grid" aria-label="Chargement"><article className="skeleton-card" /><article className="skeleton-card" /><article className="skeleton-card" /></div>
        ) : (
          <div className="metric-grid">{metrics.map(([value, label]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>Calculé depuis la base</small></article>)}</div>
        )}
        <article className="panel insight-panel">
          <div className="panel-heading"><div><h2>{role === "provider" ? "Activité des 7 derniers jours" : role === "admin" ? "Croissance de la plateforme" : "Votre activité beauté"}</h2><small>Vue synthétique</small></div><span className="insight-trend">↗ Données actualisées</span></div>
          <div className="bar-chart" aria-label="Graphique d’activité">{[38, 58, 44, 72, 61, 86, 68].map((height, index) => <span key={index} style={{ height: `${height}%` }}><i>{["L", "M", "M", "J", "V", "S", "D"][index]}</i></span>)}</div>
        </article>

        {role === "client" && clientProfile && <article className="panel onboarding-panel">
          <div className="panel-heading"><div><h2>Mon profil beauté</h2><p>Ces informations personnalisent vos recommandations et vos rendez-vous.</p></div></div>
          <form className="dashboard-form" onSubmit={(event) => void saveClientProfile(event)}>
            <label>Prénom<input name="firstName" required minLength={2} defaultValue={clientProfile.first_name ?? ""} /></label>
            <label>Nom<input name="lastName" required minLength={2} defaultValue={clientProfile.last_name ?? ""} /></label>
            <label>Téléphone<input name="phone" type="tel" autoComplete="tel" defaultValue={clientProfile.phone ?? ""} placeholder="+221 77 000 00 00" /></label>
            <label>Ville<input name="city" autoComplete="address-level2" defaultValue={clientProfile.city ?? ""} /></label>
            <label className="wide">Adresse habituelle<input name="address" autoComplete="street-address" defaultValue={clientProfile.default_address ?? ""} /></label>
            <label className="wide">Préférences beauté, séparées par des virgules<input name="preferences" defaultValue={Array.isArray(clientProfile.preferences.categories) ? clientProfile.preferences.categories.join(", ") : ""} placeholder="Tresses, soins du visage, maquillage" /></label>
            <label className="wide legal-consent"><input name="marketingConsent" type="checkbox" defaultChecked={clientProfile.marketing_consent} /><span>Recevoir les nouveautés des professionnels suivis. Facultatif.</span></label>
            <button className="primary-button" type="submit">Enregistrer mon profil</button>
          </form>
        </article>}

        {role === "provider" && providerProfile && (
          <>
          <VideoPublisher userId={userId} providerApproved={providerProfile.status === "approved"} onPublished={load} />
          <article className="panel onboarding-panel">
            <div className="panel-heading">
              <div><h2>Profil professionnel</h2><p className={`provider-state ${providerProfile.status}`}>{providerStatusLabels[providerProfile.status]}</p><label>Progression {providerProfile.onboarding_progress} %<progress value={providerProfile.onboarding_progress} max="100" /></label></div>
              {["draft", "rejected"].includes(providerProfile.status) && <button className="outline-button" disabled={providerProfile.onboarding_progress < 100} onClick={() => void submitProviderForReview()}>Envoyer pour validation</button>}
            </div>
            <form className="dashboard-form" onSubmit={(event) => void saveProviderProfile(event)}>
              <label>Nom commercial<input name="businessName" required defaultValue={providerProfile.business_name} /></label>
              <label>Ville<input name="city" required defaultValue={providerProfile.city} /></label>
              <label>Mode de prestation<select name="serviceMode" defaultValue={providerProfile.service_mode}><option value="salon">En salon</option><option value="mobile">À domicile</option><option value="both">Salon et domicile</option></select></label>
              <label>Type d’activité<select name="activityType" defaultValue={providerProfile.activity_type}><option value="independent">Indépendant</option><option value="salon">Salon</option><option value="barber_shop">Barber shop</option><option value="makeup_artist">Maquilleur</option><option value="hairdresser">Coiffeur</option><option value="nail_artist">Prothésiste ongulaire</option><option value="esthetician">Esthéticienne</option><option value="care_specialist">Spécialiste soins</option><option value="other">Autre</option></select></label>
              <label>Années d’expérience<input name="yearsExperience" type="number" min={0} max={80} defaultValue={providerProfile.years_experience} /></label>
              <label className="wide">Adresse professionnelle<input name="baseAddress" defaultValue={providerProfile.base_address ?? ""} /></label>
              <label className="wide">Langues, séparées par des virgules<input name="languages" defaultValue={providerProfile.languages.join(", ")} /></label>
              <label className="wide">Présentation (40 caractères minimum avant validation)<textarea name="bio" rows={4} defaultValue={providerProfile.bio ?? ""} /></label>
              <label className="wide">Politique d’annulation (20 caractères minimum)<textarea name="cancellationPolicy" rows={3} defaultValue={providerProfile.cancellation_policy ?? ""} /></label>
              <button className="primary-button" type="submit">Enregistrer le profil</button>
            </form>
            <form className="dashboard-form service-form" onSubmit={(event) => void addProviderService(event)}>
              <h3 className="wide">Ajouter une prestation</h3>
              <label>Type<select name="serviceId" required defaultValue=""><option value="" disabled>Choisir</option>{baseServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
              <label>Nom affiché<input name="title" required minLength={2} /></label>
              <label>Durée (minutes)<input name="durationMinutes" type="number" required min={15} max={720} step={15} /></label>
              <label>Prix (FCFA)<input name="priceAmount" type="number" required min={0} step={500} /></label>
              <button className="primary-button" type="submit">Ajouter la prestation</button>
            </form>
          </article>
          </>
        )}

        {role === "admin" && (
          <article className="panel" id="provider-moderation">
            <div className="panel-heading"><h2>Prestataires à valider</h2><button onClick={() => void load()}>Actualiser</button></div>
            {!loading && pendingProviders.length === 0 && <div className="compact-empty">Aucun dossier en attente.</div>}
            {pendingProviders.map((provider) => (
              <div className="moderation-row" key={provider.profile_id}>
                <div><strong>{provider.business_name}</strong><small>{provider.city} · envoyé le {new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium" }).format(new Date(provider.created_at))}</small></div>
                <div className="appointment-actions">
                  <button onClick={() => void moderateProvider(provider.profile_id, "approved")}>Approuver</button>
                  <button onClick={() => void moderateProvider(provider.profile_id, "rejected")}>À corriger</button>
                </div>
              </div>
            ))}
          </article>
        )}

        {role !== "admin" && (
          <article className="panel" id="live-bookings">
            <div className="panel-heading"><h2>Réservations</h2><button onClick={() => void load()}>Actualiser</button></div>
            {!loading && bookings.length === 0 && <div className="compact-empty">Aucune réservation pour le moment.</div>}
            {bookings.map((booking) => (
              <div className="appointment live-appointment" key={booking.id}>
                <span className="date-block">{new Intl.DateTimeFormat("fr-SN", { day: "2-digit", month: "short", timeZone: "Africa/Dakar" }).format(new Date(booking.starts_at))}</span>
                <div>
                  <strong>{booking.provider_services?.title ?? "Prestation beauté"}</strong>
                  <small>{new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(booking.starts_at))} · {booking.provider_services?.duration_minutes ?? Math.round((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60000)} min</small>
                  <small>{booking.location_mode === "client_address" ? booking.appointment_address : "Chez le professionnel"} · {booking.total_amount.toLocaleString("fr-FR")} {booking.currency}</small>
                </div>
                <span className={booking.status === "confirmed" ? "status confirmed" : "status pending"}>{booking.status}</span>
                <div className="appointment-actions">
                  {role === "provider" && booking.status === "pending" && <>
                    <button onClick={() => void updateStatus(booking, "confirmed")}>Accepter</button>
                    <button onClick={() => void updateStatus(booking, "declined")}>Refuser</button>
                  </>}
                  {role === "provider" && booking.status === "confirmed" && <button onClick={() => void updateStatus(booking, "in_progress")}>Démarrer</button>}
                  {role === "provider" && booking.status === "in_progress" && <button onClick={() => void updateStatus(booking, "completed")}>Terminer</button>}
                  {role === "client" && ["pending", "confirmed"].includes(booking.status) && <button onClick={() => void updateStatus(booking, "cancelled_by_client")}>Annuler</button>}
                  <button onClick={() => {
                    setMessageBooking(booking);
                    window.setTimeout(() => document.getElementById("booking-conversation")?.scrollIntoView({ behavior: "smooth" }), 0);
                  }}>Messages</button>
                </div>
              </div>
            ))}
          </article>
        )}
        {role !== "admin" && messageBooking && (
          <BookingMessages
            bookingId={messageBooking.id}
            serviceTitle={messageBooking.provider_services?.title ?? "Prestation beauté"}
            userId={userId}
            onClose={() => setMessageBooking(null)}
          />
        )}
        <article className="panel notifications-panel" id="live-notifications">
          <div className="panel-heading"><h2>Notifications</h2></div>
          {!loading && notifications.length === 0 && <div className="compact-empty">Aucune notification.</div>}
          {notifications.map((notification) => (
            <button className={notification.read_at ? "notification-row read" : "notification-row"} key={notification.id} onClick={() => !notification.read_at && void markNotificationRead(notification.id)}>
              <span>{notification.title}<small>{notification.body}</small></span>
              {!notification.read_at && <i>Nouveau</i>}
            </button>
          ))}
        </article>
      </section>
    </main>
  );
}
