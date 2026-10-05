"use client";

import { useEffect, useState } from "react";
import { BookingMessages } from "./booking-messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { useSearchParams } from "next/navigation";
import { statusLabel } from "@/lib/ui/status-label";

type BookingRow = {
  id: string;
  starts_at: string;
  status: string;
  provider_services: { title: string | null } | null;
};

export function WorkspaceMessaging({ userId }: { userId: string }) {
  const requestedBooking = useSearchParams().get("booking");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [selected, setSelected] = useState<BookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    client
      .from("bookings")
      .select("id,starts_at,status,provider_services(title)")
      .order("starts_at", { ascending: false })
      .limit(100)
      .then(({ data, error: bookingError }) => {
        if (!active) return;
        if (bookingError) setError(publicErrorMessage(bookingError, "Impossible de charger vos conversations."));
        else {
          const loaded = (data ?? []) as unknown as BookingRow[];
          setBookings(loaded);
          if (requestedBooking) setSelected(loaded.find(booking => booking.id === requestedBooking) ?? null);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [requestedBooking]);

  return <section className="workspace-content">
    <div className="workspace-intro">
      <div><h2>Messages</h2><p>Conversations privées liées à vos rendez-vous.</p></div>

    </div>
    <article className="panel" id="live-bookings">
      <div className="panel-heading"><h2>Mes conversations</h2></div>
      {error && <p role="alert" className="conversation-error">{error}</p>}
      {loading && <div className="compact-empty">Chargement de vos rendez-vous…</div>}
      {!loading && !error && bookings.length === 0 && <div className="compact-empty">Aucune conversation pour le moment. Retrouvez ici vos échanges après une réservation.</div>}
      {bookings.map((booking) => <div className="appointment live-appointment" key={booking.id}>
        <span className="date-block">{new Intl.DateTimeFormat("fr-SN", { day: "2-digit", month: "short", timeZone: "Africa/Dakar" }).format(new Date(booking.starts_at))}</span>
        <div>
          <strong>{booking.provider_services?.title ?? "Prestation beauté"}</strong>
          <small>{new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(booking.starts_at))}</small>
        </div>
        <span className={booking.status === "confirmed" ? "status confirmed" : "status pending"}>{statusLabel(booking.status)}</span>
        <div className="appointment-actions"><button type="button" onClick={() => setSelected(booking)}>Messages</button></div>
      </div>)}
    </article>
    {selected && <BookingMessages bookingId={selected.id} serviceTitle={selected.provider_services?.title ?? "Prestation beauté"} userId={userId} onClose={() => setSelected(null)} />}
  </section>;
}
