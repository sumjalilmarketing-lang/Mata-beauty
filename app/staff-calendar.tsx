"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { localDateTimeInputToInstant } from "@/lib/domain/time-zone";

type Window = { id: string; weekday: number; starts_at: string; ends_at: string };
type Absence = { id: string; starts_at: string; ends_at: string; kind: string; reason: string | null };
type Calendar = { id: string; salon_name: string; time_zone: string; is_bookable: boolean; hours: Window[]; absences: Absence[]; services: string[]; conflicts: number };
const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
function client() { const value = getSupabaseBrowserClient(); if (!value) throw new Error("Connexion indisponible"); return value; }

export function StaffCalendar() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false);
  const load = useCallback(async () => {
    const result = await client().rpc("get_my_collaborator_calendar").abortSignal(AbortSignal.timeout(12000));
    if (result.error) throw result.error;
    setCalendars((result.data ?? []) as Calendar[]);
  }, []);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => { void load().catch(() => { if (active) setError("Vos disponibilités n’ont pas pu être chargées."); }).finally(() => { if (active) setLoading(false); }); }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [load]);
  const calendar = calendars.find(item => item.id === selected) ?? calendars[0];
  async function mutate(action: () => PromiseLike<{ error: unknown }>, success: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { const result = await action(); if (result.error) throw result.error; await load(); setNotice(success); }
    catch { setError("Modification impossible. Vérifiez les dates, les chevauchements et vos accès, puis réessayez."); }
    finally { lock.current = false; setBusy(false); }
  }
  function hours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!calendar) return;
    const form = new FormData(event.currentTarget);
    void mutate(() => client().rpc("staff_add_working_hours", { target_collaborator: calendar.id, target_weekday: Number(form.get("weekday")), target_start: form.get("start"), target_end: form.get("end") }), "Horaire ajouté. Les créneaux de réservation sont actualisés.");
  }
  function absence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!calendar) return;
    const form = new FormData(event.currentTarget);
    try {
      const start = localDateTimeInputToInstant(String(form.get("start")), calendar.time_zone).toISOString();
      const end = localDateTimeInputToInstant(String(form.get("end")), calendar.time_zone, "end").toISOString();
      void mutate(() => client().rpc("staff_add_unavailability", { target_collaborator: calendar.id, target_start: start, target_end: end, target_kind: form.get("kind"), target_reason: String(form.get("reason") ?? "") }), "Indisponibilité enregistrée. Le responsable est informé. Les rendez-vous existants restent à traiter.");
    } catch { setError("Vérifiez les dates et heures dans le fuseau du salon."); }
  }
  function remove(id: string, kind: string) {
    void mutate(() => client().rpc("staff_remove_calendar_entry", { target_entry: id, target_kind: kind }), "Créneau supprimé. Vos disponibilités sont actualisées.");
  }
  function date(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: calendar?.time_zone ?? "UTC" }).format(new Date(value)); }
  return <section className="workspace-content">
    <h2>Mes disponibilités</h2><p>Gérez vos horaires et vos indisponibilités pour chaque salon. Les rendez-vous déjà acceptés restent dans votre agenda ; vous pouvez les transférer à un collègue disponible.</p>
    {loading && <p role="status">Chargement de vos disponibilités…</p>}{error && <><p role="alert">{error}</p><button type="button" disabled={loading || busy} onClick={() => { setLoading(true); setError(""); void load().catch(() => setError("Vos disponibilités n’ont pas pu être chargées.")).finally(() => setLoading(false)); }}>Réessayer</button></>}{notice && <p role="status">{notice}</p>}
    {!loading && !calendar && !error && <p>Aucun accès à un agenda de salon. Contactez le responsable.</p>}
    {calendar && <div key={calendar.id}>
      <article className="workspace-panel salon-panel"><label>Mon salon<select value={calendar.id} disabled={busy} onChange={event => { setSelected(event.target.value); setNotice(""); setError(""); }}>{calendars.map(item => <option key={item.id} value={item.id}>{item.salon_name}</option>)}</select></label>
        <p>Heures du salon : {calendar.time_zone}.</p><p>Mes prestations : {calendar.services.length ? calendar.services.join(", ") : "Le responsable doit encore m’attribuer des prestations."}</p>
        {!calendar.is_bookable && <p>Le responsable doit activer ma fiche pour la réservation en ligne.</p>}
        {calendar.conflicts > 0 && <p role="status">{calendar.conflicts} rendez-vous à vérifier après une modification de disponibilités. <Link href="/staff/agenda">Ouvrir mon agenda pour les réattribuer</Link></p>}
      </article>
      <article className="workspace-panel salon-panel"><h3>Mes horaires habituels</h3>
        <form className="salon-form" onSubmit={hours}><label>Jour<select name="weekday" disabled={busy}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Début de travail<input name="start" type="time" required disabled={busy} /></label><label>Fin de travail<input name="end" type="time" required disabled={busy} /></label><button disabled={busy}>Ajouter cet horaire</button></form>
        {calendar.hours.map(item => <div className="salon-list" key={item.id}><p>{days[item.weekday]} · {item.starts_at.slice(0, 5)}–{item.ends_at.slice(0, 5)}</p><button disabled={busy} onClick={() => remove(item.id, "hours")}>Supprimer l’horaire du {days[item.weekday]}</button></div>)}
        {!calendar.hours.length && <p>Aucun horaire configuré. Ajoutez vos heures de travail pour proposer des créneaux.</p>}
      </article>
      <article className="workspace-panel salon-panel"><h3>Congé, absence ou planning complet</h3><p>La période choisie sera fermée aux nouvelles réservations. Aucun rendez-vous existant ne sera annulé automatiquement.</p>
        <form className="salon-form" onSubmit={absence}><label>Situation<select name="kind" disabled={busy}><option value="rest">Je suis complet / indisponible</option><option value="leave">Congé</option><option value="absence">Absence</option></select></label><label>Indisponible à partir du<input type="datetime-local" name="start" required disabled={busy} /></label><label>Indisponible jusqu’au<input type="datetime-local" name="end" required disabled={busy} /></label><label>Motif (facultatif)<input name="reason" maxLength={240} disabled={busy} /></label><button disabled={busy}>Bloquer cette période</button></form>
        {calendar.absences.map(item => <div className="salon-list" key={item.id}><p>{date(item.starts_at)} → {date(item.ends_at)} · {item.kind === "leave" ? "Congé" : item.kind === "rest" ? "Complet / indisponible" : "Absence"}{item.reason ? ` · ${item.reason}` : ""}</p><button disabled={busy} onClick={() => remove(item.id, "absence")}>Supprimer cette indisponibilité</button></div>)}
      </article>
    </div>}
  </section>;
}
