"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookingFeedback } from "./booking-feedback";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadProviderReviewBookings, reviewBookingPageSize } from "@/lib/domain/provider-review-bookings";

type ReviewBooking = { id: string; starts_at: string; provider_services: { title: string } | { title: string }[] | null };
export function ProviderReviewBookings({ providerId, businessId }: { providerId: string; businessId?: string }) {
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
        const result = await loadProviderReviewBookings(client, providerId, page, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]), businessId);
        if (result.error) throw result.error;
        if (!active) return;
        const batch = (result.data ?? []) as unknown as ReviewBooking[];
        setRows(batch.slice(0, reviewBookingPageSize)); setMore(batch.length > reviewBookingPageSize);
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [providerId, businessId, page, attempt]);
  return <article className="panel" aria-labelledby="completed-reviews-heading">
    <h2 id="completed-reviews-heading">Avis de mes rendez-vous</h2>
    <p>Consultez les avis reçus après vos prestations et évaluez vos clients. Ouvrez le rendez-vous concerné ci-dessous.</p>
    <p>Une évaluation par prestation et par sens. Les avis publics sont dévoilés après les deux évaluations ou après 48 heures ; les commentaires internes du salon restent privés. Un avis encore sous ce délai peut donc ne pas être visible.</p>
    {loading ? <p role="status">Chargement des prestations à évaluer…</p> : error ? <div role="alert"><p>Les prestations à évaluer n’ont pas pu être chargées.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></div> : <>
      {!rows.length && <p>Aucune prestation terminée à évaluer pour le moment. <Link href="/pro/bookings">Voir mes réservations</Link></p>}
      {rows.map(row => <ReviewBookingCard key={row.id} row={row} />)}
      {(page > 0 || more) && <nav className="workspace-pagination" aria-label="Prestations à évaluer"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Précédent</button><span> Page {page + 1} </span><button type="button" disabled={!more} onClick={() => setPage(value => value + 1)}>Suivant</button></nav>}
    </>}
    <LegacyProviderReviews providerId={providerId} />
  </article>;
}
function ReviewBookingCard({ row }: { row: ReviewBooking }) {
  const [open, setOpen] = useState(false);
  const service = Array.isArray(row.provider_services) ? row.provider_services[0] : row.provider_services;
  return <details className="review-booking-card" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{service?.title ?? "Prestation beauté"} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(row.starts_at))} · Consulter les avis / Évaluer le client</summary>
    {open && <BookingFeedback bookingId={row.id} direction="provider_to_client" />}
  </details>;
}

function LegacyProviderReviews({ providerId }: { providerId: string }) {
  const [rows, setRows] = useState<{ id: string; rating: number; comment: string | null; provider_reply: string | null }[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const api = getSupabaseBrowserClient();
    if (api) void api.from("reviews").select("id,rating,comment,provider_reply").eq("provider_id", providerId).eq("is_visible", true).order("created_at", { ascending: false }).limit(50).abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])).then(result => {
      if (active) { setRows(result.data ?? []); setError(Boolean(result.error)); }
    });
    return () => { active = false; controller.abort(); };
  }, [providerId]);
  return <details><summary>Historique des avis précédents</summary>{error ? <p role="alert">L’historique n’a pas pu être chargé.</p> : rows.length ? rows.map(row => <p key={row.id}>{row.rating} / 5 · {row.comment || "Sans commentaire"}{row.provider_reply ? ` · Réponse : ${row.provider_reply}` : ""}</p>) : <p>Aucun avis précédent à afficher.</p>}</details>;
}
