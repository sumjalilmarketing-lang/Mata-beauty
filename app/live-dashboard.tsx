"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canTransitionBooking, type BookingStatus } from "@/lib/domain/booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Role = "client" | "provider" | "admin";
type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  total_amount: number;
  currency: string;
};
type NotificationRow = {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
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
  const [adminMetrics, setAdminMetrics] = useState({ users: 0, providersPending: 0, reportsOpen: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

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
        const [users, pending, reports] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("provider_profiles").select("profile_id", { count: "exact", head: true }).eq("status", "pending_review"),
          supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
        ]);
        const firstError = users.error ?? pending.error ?? reports.error;
        if (firstError) throw firstError;
        setAdminMetrics({
          users: users.count ?? 0,
          providersPending: pending.count ?? 0,
          reportsOpen: reports.count ?? 0,
        });
      } else {
        const ownerColumn = role === "client" ? "client_id" : "provider_id";
        const { data, error: bookingError } = await supabase
          .from("bookings")
          .select("id,starts_at,ends_at,status,total_amount,currency")
          .eq(ownerColumn, userId)
          .order("starts_at", { ascending: true })
          .limit(30);
        if (bookingError) throw bookingError;
        setBookings((data ?? []) as unknown as BookingRow[]);
      }
      const { data: notificationData, error: notificationError } = await supabase
        .from("notifications")
        .select("id,title,body,read_at,created_at")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (notificationError) throw notificationError;
      setNotifications((notificationData ?? []) as unknown as NotificationRow[]);
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
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", booking.id);
    if (updateError) {
      setFeedback(updateError.message);
      return;
    }
    setFeedback("Réservation mise à jour.");
    await load();
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
          <button onClick={() => document.getElementById("live-bookings")?.scrollIntoView({ behavior: "smooth" })}>▣ Réservations</button>
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
        {role !== "admin" && (
          <article className="panel" id="live-bookings">
            <div className="panel-heading"><h2>Réservations</h2><button onClick={() => void load()}>Actualiser</button></div>
            {!loading && bookings.length === 0 && <div className="compact-empty">Aucune réservation pour le moment.</div>}
            {bookings.map((booking) => (
              <div className="appointment live-appointment" key={booking.id}>
                <span className="date-block">{new Intl.DateTimeFormat("fr-SN", { day: "2-digit", month: "short", timeZone: "Africa/Dakar" }).format(new Date(booking.starts_at))}</span>
                <div>
                  <strong>{new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(booking.starts_at))}</strong>
                  <small>{booking.total_amount.toLocaleString("fr-FR")} {booking.currency}</small>
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
                </div>
              </div>
            ))}
          </article>
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
