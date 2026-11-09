"use client";

import { useEffect, useRef, useState } from "react";
import "./client-booking-reschedule.css";
import { clientRescheduleResult, clientRescheduleSlots, type ClientRescheduleResult } from "@/lib/domain/client-reschedule";
import { localDateAt } from "@/lib/domain/time-zone";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ClientBookingReschedule({ bookingId, startsAt, timeZone = "UTC", onSaved }: {
  bookingId: string; startsAt: string; timeZone?: string; onSaved: (booking: ClientRescheduleResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localDateAt(new Date(startsAt), timeZone));
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [success, setSuccess] = useState("");
  const pending = useRef(false);
  async function authorization() {
    const api = getSupabaseBrowserClient();
    const session = await api?.auth.getSession();
    if (!session?.data.session?.access_token) throw Error("Reconnectez-vous pour déplacer votre rendez-vous.");
    return { Authorization: `Bearer ${session.data.session.access_token}` };
  }
  useEffect(() => {
    if (!open || !date) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 18_000);
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true); setError(""); setSlots([]); setSelected("");
      try {
        const auth = await authorization();
        const response = await fetch(`/api/bookings/reschedule?bookingId=${encodeURIComponent(bookingId)}&date=${encodeURIComponent(date)}`, { headers: auth, cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw Error(body.error?.message ?? "Disponibilités indisponibles.");
        const parsed = clientRescheduleSlots.safeParse(body.slots);
        if (!parsed.success) throw Error("Les disponibilités n’ont pas pu être vérifiées.");
        if (active) setSlots(parsed.data.map(slot => slot.slot_start));
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Disponibilités indisponibles."); }
      finally { window.clearTimeout(timeout); if (active) setLoading(false); }
    });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [open, date, bookingId, attempt]);
  async function save() {
    if (pending.current || !selected) return;
    pending.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      const auth = await authorization();
      const response = await fetch("/api/bookings/reschedule", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, startsAt: selected }), signal: AbortSignal.timeout(20_000) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error?.message ?? "Le report n’a pas pu être confirmé.");
      const parsed = clientRescheduleResult.safeParse(body.booking);
      if (!parsed.success || parsed.data.id !== bookingId) throw Error("Le report n’a pas pu être vérifié. Actualisez vos rendez-vous.");
      onSaved(parsed.data); setOpen(false); setSelected("");
      setSuccess(`Rendez-vous déplacé au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(parsed.data.startsAt))}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Le report n’a pas pu être vérifié. Actualisez vos rendez-vous avant de réessayer.");
    } finally { pending.current = false; setBusy(false); }
  }
  return <div className="client-booking-reschedule">
    <button type="button" aria-expanded={open} disabled={busy} onClick={() => { setSuccess(""); setOpen(value => !value); }}>{open ? "Fermer le report" : "Déplacer"}</button>
    {success && <p role="status">{success}</p>}
    {open && <section aria-label="Déplacer votre rendez-vous">
      <p>Report gratuit à plus de 48 h du rendez-vous, avant tout paiement. Le professionnel, la durée et le prix sont conservés.</p>
      <label>Nouvelle date · {timeZone}<input type="date" required disabled={busy} min={localDateAt(new Date(), timeZone)} value={date} onChange={event => { setDate(event.target.value); setSelected(""); setSlots([]); setLoading(Boolean(event.target.value)); setError(""); }} /></label>
      {loading ? <p role="status">Recherche des créneaux…</p> : slots.length ? <div aria-label="Nouveaux créneaux">{slots.map(slot => <button type="button" key={slot} disabled={busy} aria-pressed={selected === slot} onClick={() => setSelected(slot)}>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(slot))}</button>)}</div> : !error && <p>Aucun créneau disponible pour cette date.</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy || loading} onClick={() => setAttempt(value => value + 1)}>Actualiser les disponibilités</button>
      <button type="button" disabled={busy || loading || !selected} onClick={() => void save()}>{busy ? "Enregistrement…" : "Confirmer le report"}</button>
    </section>}
  </div>;
}
