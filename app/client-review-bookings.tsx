"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookingFeedback } from "./booking-feedback";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadClientReviewBookings, reviewBookingPageSize } from "@/lib/domain/review-bookings";

type ReviewBooking = { id: string; starts_at: string; provider_services: { title: string } | { title: string }[] | null };
export function ClientReviewBookings({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<ReviewBooking[]>([]);
  const [page, setPage] = useState(0), [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [more, setMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true); setError(false);
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw Error("unavailable");
        const result = await loadClientReviewBookings(client, clientId, page, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]));
        if (result.error) throw result.error;
        if (!active) return;
        const batch = (result.data ?? []) as unknown as ReviewBooking[];
        setRows(batch.slice(0, reviewBookingPageSize)); setMore(batch.length > reviewBookingPageSize);
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [clientId, page, attempt]);
  return <article className="panel" aria-labelledby="completed-reviews-heading">
    <h2 id="completed-reviews-heading">Évaluer mes prestations terminées</h2>
    <p>Après chaque prestation terminée, donnez votre avis et consultez l’évaluation reçue du professionnel ou du collaborateur.</p>
    <p>Une évaluation par prestation et par sens. Les avis publics sont dévoilés après les deux évaluations ou après 48 heures ; les commentaires internes du salon restent privés.</p>
    {loading ? <p role="status">Chargement des prestations à évaluer…</p> : error ? <div role="alert"><p>Les prestations à évaluer n’ont pas pu être chargées.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></div> : <>
      {!rows.length && <p>Aucune prestation terminée à évaluer pour le moment. <Link href="/app/bookings">Voir mes réservations</Link></p>}
      {rows.map(row => <ReviewBookingCard key={row.id} row={row} />)}
      {(page > 0 || more) && <nav className="workspace-pagination" aria-label="Prestations à évaluer"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Précédent</button><span> Page {page + 1} </span><button type="button" disabled={!more} onClick={() => setPage(value => value + 1)}>Suivant</button></nav>}
    </>}
  </article>;
}
function ReviewBookingCard({ row }: { row: ReviewBooking }) {
  const [open, setOpen] = useState(false);
  const service = Array.isArray(row.provider_services) ? row.provider_services[0] : row.provider_services;
  return <details className="review-booking-card" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{service?.title ?? "Prestation beauté"} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(row.starts_at))} · Donner ou consulter mon avis</summary>
    {open && <BookingFeedback bookingId={row.id} direction="client_to_provider" />}
  </details>;
}
