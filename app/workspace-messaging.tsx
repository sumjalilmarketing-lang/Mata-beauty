"use client";

import { useEffect, useState } from "react";
import { BookingMessages } from "./booking-messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { useSearchParams } from "next/navigation";
import { statusLabel } from "@/lib/ui/status-label";
import "./workspace-messaging.css";

type BookingRow = {
  id: string;
  starts_at: string;
  status: string;
  provider_services: { title: string | null } | null;
};

export function WorkspaceMessaging({ userId, staffMode = false, canReply = true }: { userId: string; staffMode?: boolean; canReply?: boolean }) {
  const requestedBooking = useSearchParams().get("booking");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [selected, setSelected] = useState<BookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client) {
      queueMicrotask(() => {
        if (active) {
          setError("La messagerie est momentanément indisponible.");
          setLoading(false);
        }
      });
      return () => { active = false; };
    }
    void (async () => {
      const result = staffMode
        ? await client.rpc("list_staff_message_bookings")
        : await client.from("bookings").select("id,starts_at,status,provider_services(title)").order("starts_at", { ascending: false }).limit(100);
      const { data, error: bookingError } = result;
        if (!active) return;
        if (bookingError) setError(publicErrorMessage(bookingError, "Impossible de charger vos conversations."));
        else {
          const loaded = staffMode
            ? ((data ?? []) as { id: string; starts_at: string; status: string; service_title: string | null }[]).map(row => ({ id: row.id, starts_at: row.starts_at, status: row.status, provider_services: { title: row.service_title } }))
            : (data ?? []) as unknown as BookingRow[];
          setBookings(loaded);
          if (requestedBooking) setSelected(loaded.find(booking => booking.id === requestedBooking) ?? null);
        }
        setLoading(false);
    })();
    return () => { active = false; };
  }, [requestedBooking, staffMode]);

  const normalized = query.trim().toLocaleLowerCase("fr");
  const visibleBookings = bookings.filter(booking => !normalized || `${booking.provider_services?.title ?? ""} ${statusLabel(booking.status)}`.toLocaleLowerCase("fr").includes(normalized));

  return <section className={`workspace-content messaging-workspace${selected ? " has-conversation" : ""}`}>
    <div className="workspace-intro"><div><h2>Messages</h2><p>Vos échanges privés liés aux rendez-vous.</p></div></div>
    <div className="messaging-columns">
    <div className="workspace-intro">
      <div><h2>Messages</h2><p>Conversations privées liées à vos rendez-vous.</p></div>

    </div>
    <article className="panel conversation-inbox" id="live-bookings" aria-label="Liste des conversations">
      <div className="panel-heading"><h2>Mes conversations</h2></div>
      <label className="conversation-search">Rechercher un rendez-vous ou un statut
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Prestation, statut…" />
      </label>
      {error && <p role="alert" className="conversation-error">{error}</p>}
      {loading && <div className="messaging-list-empty">Chargement de vos rendez-vous…</div>}
      {!loading && !error && bookings.length === 0 && <div className="messaging-list-empty">Aucune conversation pour le moment. Retrouvez ici vos échanges après une réservation.</div>}
      {!loading && !error && bookings.length > 0 && visibleBookings.length === 0 && <div className="messaging-list-empty">Aucun rendez-vous ne correspond à votre recherche.</div>}
      <div className="conversation-list">
        {visibleBookings.map(booking => {
          const service = booking.provider_services?.title ?? "Prestation beauté";
          const date = new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(booking.starts_at));
          return <article className="messaging-conversation-row" key={booking.id} aria-current={selected?.id === booking.id ? "true" : undefined}>
            <span className="conversation-date-avatar" aria-hidden="true">✉</span>
            <div className="conversation-row-copy">
              <strong>{service}</strong>
              <small>{date}</small>
            </div>
            <span className={`conversation-row-status ${booking.status === "confirmed" ? "confirmed" : booking.status === "pending" ? "pending" : ""}`}>{statusLabel(booking.status)}</span>
            <button className="messaging-open-button" type="button" aria-label="Messages" onClick={() => setSelected(booking)}>Ouvrir</button>
          </article>;
        })}
      </div>
    </article>
    {selected
      ? <div className="conversation-thread"><BookingMessages key={selected.id} bookingId={selected.id} serviceTitle={selected.provider_services?.title ?? "Prestation beauté"} userId={userId} canReply={canReply} onClose={() => setSelected(null)} /></div>
      : <aside className="messaging-empty" aria-label="Aucune conversation sélectionnée">
          <span className="messaging-empty-icon" aria-hidden="true">✉</span>
          <h3>Vos conversations, au même endroit</h3>
          <p>Sélectionnez un rendez-vous pour retrouver l’échange privé associé et poursuivre la discussion.</p>
          <span className="messaging-workspace-note">Vos échanges restent privés.</span>
        </aside>}
    </div>
  </section>;
}
