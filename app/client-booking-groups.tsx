"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { clientBookingStatusTone, groupClientBookings, type ClientBookingItem } from "@/lib/domain/client-bookings";
import { canClientCancel } from "@/lib/domain/booking";
import { BookingReview } from "./booking-review";
import "./client-booking-groups.css";

const labels: Record<ClientBookingItem["status"], string> = {
  pending: "En attente", confirmed: "Confirmé", declined: "Refusé", cancelled_by_client: "Annulé par vous",
  cancelled_by_provider: "Annulé par le professionnel", in_progress: "En cours", completed: "Terminé", no_show: "Absence", disputed: "En litige",
};

const money = (amount: number, currency: string) => `${amount.toLocaleString("fr-FR")} ${currency}`;
const dateTime = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(value));

export function ClientBookingGroups({ items, clientId, stats, cancellationWindowHours, hasMore, loadingMore, onLoadMore, onMessage, onCancel }: { items: readonly ClientBookingItem[]; clientId: string; stats: { upcoming: number; pending: number; past: number }; cancellationWindowHours: number; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void; onMessage: (booking: ClientBookingItem) => void; onCancel: (booking: ClientBookingItem) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupClientBookings(items);

  return <>
    <section className="client-booking-overview" aria-label="Synthèse de vos rendez-vous">
      <article><span>À venir</span><strong>{stats.upcoming}</strong></article>
      <article><span>En attente</span><strong>{stats.pending}</strong></article>
      <article><span>Passés</span><strong>{stats.past}</strong></article>
    </section>
    {groups.length === 0 ? <div className="compact-empty">Aucun rendez-vous pour le moment.</div> : <div className="client-booking-groups">
    {groups.map((group) => {
      const upcoming = group.nextBooking;
      const cardStatus = upcoming ?? group.latestClosedBooking;
      const tone = cardStatus ? clientBookingStatusTone(cardStatus.status) : "empty";
      const bookingForService = [...(upcoming ? [upcoming] : []), ...[...group.bookings].reverse()].find((booking) => booking.serviceBookable) ?? null;
      const bookingForContact = upcoming ?? group.bookings.at(-1) ?? null;
      const profileHref = group.providerSlug ? `/professional/${encodeURIComponent(group.providerSlug)}` : null;
      const expanded = open === group.id;

      return <article className="client-booking-card" key={group.id}>
        <div className="client-booking-card__top">
          {group.providerImage ? <Image className="client-booking-card__avatar" src={group.providerImage} alt="" width={64} height={64} unoptimized /> : <span className="client-booking-card__avatar client-booking-card__avatar--fallback" aria-hidden="true">{group.providerName.slice(0, 1).toLocaleUpperCase("fr")}</span>}
          <div className="client-booking-card__identity">
            <h3>{profileHref ? <Link href={profileHref}>{group.providerName}</Link> : group.providerName}</h3>
            <p>{group.address ?? "Adresse non renseignée"}</p>
          </div>
          <span className={`client-booking-status client-booking-status--${tone}`}><i aria-hidden="true" />{cardStatus ? labels[cardStatus.status] : "Aucun rendez-vous actif"}</span>
        </div>
        <div className="client-booking-card__summary">
          <div><strong>{group.activeCount}</strong><span>{group.activeCount === 1 ? "rendez-vous actif" : "rendez-vous actifs"}</span></div>
          {upcoming ? <p><b>{upcoming.status === "in_progress" ? "Rendez-vous en cours" : "Prochain rendez-vous"}</b><br />{dateTime(upcoming.startsAt)} · {upcoming.serviceName}</p> : <p>Aucun rendez-vous à venir.</p>}
        </div>
        <div className="client-booking-card__actions">
          <button type="button" className="client-booking-history-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : group.id)}>{expanded ? "Masquer l’historique" : `Voir l’historique (${group.bookings.length})`}</button>
          {bookingForContact && <button type="button" className="client-booking-contact" onClick={() => onMessage(bookingForContact)}>Contacter</button>}
          {(bookingForService || profileHref) && <Link className="client-booking-rebook" href={bookingForService ? `/?service=${encodeURIComponent(bookingForService.serviceId)}` : profileHref!}>Reprendre rendez-vous</Link>}
        </div>
        {expanded && <ol className="client-booking-timeline" aria-label={`Historique des rendez-vous chez ${group.providerName}`}>
          {group.bookings.map((booking) => <li key={booking.id} id={`booking-${booking.id}`}>
            <span className={`client-booking-status client-booking-status--${clientBookingStatusTone(booking.status)}`}><i aria-hidden="true" />{labels[booking.status]}</span>
            <div><strong>{booking.serviceName}</strong><time dateTime={booking.startsAt}>{dateTime(booking.startsAt)}</time></div>
            <b>{money(booking.amount, booking.currency)}</b>
            <div className="client-booking-timeline__actions">
              <button type="button" onClick={() => onMessage(booking)}>Messages</button>
              {booking.status === "completed" && <BookingReview bookingId={booking.id} clientId={clientId} providerId={booking.providerId} performer={null} />}
              {["pending", "confirmed"].includes(booking.status) && <button type="button" className="client-booking-cancel" disabled={!canClientCancel(new Date(booking.startsAt), new Date(), cancellationWindowHours)} onClick={() => onCancel(booking)}>Annuler</button>}{["pending", "confirmed"].includes(booking.status) && !canClientCancel(new Date(booking.startsAt), new Date(), cancellationWindowHours) && <small>Annulation possible au moins {cancellationWindowHours} h avant le rendez-vous.</small>}
            </div>
          </li>)}
        </ol>}
      </article>;
    })}
    </div>}
    {hasMore && <button type="button" className="client-booking-load-more" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? "Chargement…" : "Charger l’historique précédent"}</button>}
  </>;
}

