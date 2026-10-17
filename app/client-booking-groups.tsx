"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { groupClientBookings, type ClientBookingItem } from "@/lib/domain/client-bookings";
import { BookingReview } from "./booking-review";
import "./client-booking-groups.css";

const labels: Record<ClientBookingItem["status"], string> = {
  pending: "En attente", confirmed: "Confirmé", declined: "Refusé", cancelled_by_client: "Annulé par vous",
  cancelled_by_provider: "Annulé par le professionnel", in_progress: "En cours", completed: "Terminé", no_show: "Absence", disputed: "En litige",
};

const money = (amount: number, currency: string) => `${amount.toLocaleString("fr-FR")} ${currency}`;
const dateTime = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(value));

export function ClientBookingGroups({ items, clientId, onMessage, onCancel }: { items: readonly ClientBookingItem[]; clientId: string; onMessage: (booking: ClientBookingItem) => void; onCancel: (booking: ClientBookingItem) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupClientBookings(items);

  if (groups.length === 0) return <div className="compact-empty">Aucun rendez-vous pour le moment.</div>;

  return <div className="client-booking-groups">
    {groups.map((group) => {
      const upcoming = group.nextBooking;
      const tone = upcoming?.status === "confirmed" || upcoming?.status === "in_progress" ? "confirmed" : upcoming?.status === "pending" ? "pending" : group.latestClosedBooking ? "closed" : "empty";
      const bookingForService = [...(upcoming ? [upcoming] : []), ...[...group.bookings].reverse()].find((booking) => booking.serviceBookable) ?? null;
      const profileHref = group.providerSlug ? `/professional/${encodeURIComponent(group.providerSlug)}` : null;
      const expanded = open === group.id;

      return <article className="client-booking-card" key={group.id}>
        <div className="client-booking-card__top">
          {group.providerImage ? <Image className="client-booking-card__avatar" src={group.providerImage} alt="" width={64} height={64} unoptimized /> : <span className="client-booking-card__avatar client-booking-card__avatar--fallback" aria-hidden="true">{group.providerName.slice(0, 1).toLocaleUpperCase("fr")}</span>}
          <div className="client-booking-card__identity">
            <h3>{profileHref ? <Link href={profileHref}>{group.providerName}</Link> : group.providerName}</h3>
            <p>{group.address ?? "Adresse non renseignée"}</p>
          </div>
          <span className={`client-booking-status client-booking-status--${tone}`}><i aria-hidden="true" />{upcoming ? labels[upcoming.status] : group.latestClosedBooking ? labels[group.latestClosedBooking.status] : "Aucun rendez-vous actif"}</span>
        </div>
        <div className="client-booking-card__summary">
          <div><strong>{group.activeCount}</strong><span>{group.activeCount === 1 ? "rendez-vous actif" : "rendez-vous actifs"}</span></div>
          {upcoming ? <p><b>Prochain rendez-vous</b><br />{dateTime(upcoming.startsAt)} · {upcoming.serviceName}</p> : <p>Aucun rendez-vous à venir.</p>}
        </div>
        <div className="client-booking-card__actions">
          <button type="button" className="client-booking-history-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : group.id)}>{expanded ? "Masquer l’historique" : `Voir l’historique (${group.bookings.length})`}</button>
          {(bookingForService || profileHref) && <Link className="client-booking-rebook" href={bookingForService ? `/?service=${encodeURIComponent(bookingForService.serviceId)}` : profileHref!}>Reprendre rendez-vous</Link>}
        </div>
        {expanded && <ol className="client-booking-timeline" aria-label={`Historique des rendez-vous chez ${group.providerName}`}>
          {group.bookings.map((booking) => <li key={booking.id} id={`booking-${booking.id}`}>
            <span className={`client-booking-status client-booking-status--${booking.status === "confirmed" || booking.status === "completed" || booking.status === "in_progress" ? "confirmed" : booking.status === "pending" ? "pending" : ["declined", "cancelled_by_client", "cancelled_by_provider"].includes(booking.status) ? "closed" : "empty"}`}><i aria-hidden="true" />{labels[booking.status]}</span>
            <div><strong>{booking.serviceName}</strong><time dateTime={booking.startsAt}>{dateTime(booking.startsAt)}</time></div>
            <b>{money(booking.amount, booking.currency)}</b>
            <div className="client-booking-timeline__actions">
              <button type="button" onClick={() => onMessage(booking)}>Messages</button>
              {booking.status === "completed" && <BookingReview bookingId={booking.id} clientId={clientId} providerId={booking.providerId} performer={null} />}
              {["pending", "confirmed"].includes(booking.status) && <button type="button" className="client-booking-cancel" onClick={() => onCancel(booking)}>Annuler</button>}
            </div>
          </li>)}
        </ol>}
      </article>;
    })}
  </div>;
}

