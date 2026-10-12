"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { conversationQuoteSchema, quoteAvailabilitySchema, quoteBookingResultSchema, quoteCanBeBooked, quoteDuration, quoteMoney, quoteStatusLabels, type ConversationQuote, type QuoteBooking, type QuoteSlot } from "@/lib/domain/quotes";
import "./quote-booking.css";

const timeLabel = (value: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" }).format(new Date(value));
const dateLabel = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Africa/Dakar" }).format(new Date(value));
const bookingStatuses: Record<string, string> = { pending: "En attente de confirmation du professionnel", confirmed: "Confirmé", completed: "Terminé", in_progress: "En cours", declined: "Refusé", cancelled_by_client: "Annulé par le client", cancelled_by_provider: "Annulé par le professionnel", no_show: "Absence", disputed: "Litige" };

export function QuoteBookingPage({ quoteId, userId, supabaseUrl, supabaseAnonKey }: {
  quoteId: string; userId: string; supabaseUrl: string; supabaseAnonKey: string;
}) {
  const [supabase] = useState(() => { configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey }); return getSupabaseBrowserClient(); });
  const [quote, setQuote] = useState<ConversationQuote | null>(null);
  const [error, setError] = useState(supabase ? "" : "La connexion au service est indisponible.");
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [slots, setSlots] = useState<QuoteSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState("");
  const [employee, setEmployee] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [mode, setMode] = useState<"salon" | "client_address">("salon");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [preview, setPreview] = useState<QuoteBooking | null>(null);
  const [confirmed, setConfirmed] = useState<QuoteBooking | null>(null);
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const nonce = useRef<string | null>(null);
  const locationRequest = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(timer); locationRequest.current += 1; };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let current = true;
    void supabase.rpc("get_conversation_quote", { target_quote_id: quoteId }).then(({ data, error: failure }) => {
      if (!current) return;
      const parsed = conversationQuoteSchema.safeParse(data);
      if (failure || !parsed.success) { setError(failure?.message || "Ce devis est inaccessible. Vérifiez votre compte."); return; }
      setError(""); setQuote(parsed.data);
      setMode((selected) => parsed.data.location_modes.includes(selected) ? selected : parsed.data.location_modes[0] ?? "salon");
    });
    return () => { current = false; };
  }, [supabase, quoteId, reload]);

  const activeId = quote?.id, activeStatus = quote?.status;
  useEffect(() => {
    if (!supabase || !activeId || activeStatus !== "accepted") return;
    let current = true;
    const load = async () => {
      setSlotsLoading(true);
      const { data, error: failure } = await supabase.rpc("get_conversation_quote_availability", { target_quote_id: activeId, target_day: date });
      if (!current) return;
      const parsed = quoteAvailabilitySchema.safeParse(data);
      if (failure || !parsed.success) { setSlotsError(failure?.message || "Disponibilités indisponibles. Réessayez."); setSlots([]); }
      else {
        setSlotsError(""); setSlots(parsed.data.slots);
        setQuote((previous) => previous?.version === parsed.data.quote.version ? previous : parsed.data.quote);
      }
      setSlotsLoading(false);
    };
    void load();
    return () => { current = false; };
  }, [supabase, activeId, activeStatus, date, reload]);

  function invalidate() { setPreview(null); nonce.current = null; setError(""); }
  function locate() {
    const requestId = ++locationRequest.current;
    if (!navigator.geolocation) { setLocationMessage("La localisation n’est pas disponible sur cet appareil."); return; }
    setLocationMessage("Recherche de la position du rendez-vous…");
    navigator.geolocation.getCurrentPosition((result) => {
      if (requestId !== locationRequest.current) return;
      if (result.coords.accuracy > 500) { setLocationMessage("Position trop imprécise. Réessayez à l’adresse du rendez-vous."); return; }
      setPosition({ latitude: result.coords.latitude, longitude: result.coords.longitude });
      setLocationMessage("Position enregistrée. Vérifiez qu’elle correspond à l’adresse du rendez-vous."); invalidate();
    }, (failure) => {
      if (requestId !== locationRequest.current) return;
      setLocationMessage(failure.code === 1 ? "Localisation refusée. Autorisez-la pour vérifier la zone de déplacement, ou choisissez le salon." : "Position indisponible. Réessayez à l’adresse du rendez-vous.");
    }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true });
  }
  function requestArguments() {
    return { target_quote_id: quoteId, target_starts_at: startsAt, target_collaborator_id: employee || null,
      target_location_mode: mode, target_address: mode === "client_address" ? address.trim() : null,
      target_latitude: mode === "client_address" ? position?.latitude ?? null : null,
      target_longitude: mode === "client_address" ? position?.longitude ?? null : null };
  }
  async function showRecap() {
    if (!supabase || pending.current) return;
    pending.current = true; setBusy("preview"); setError("");
    try {
      const { data, error: failure } = await supabase.rpc("preview_conversation_quote_booking", requestArguments());
      const parsed = quoteBookingResultSchema.safeParse(data);
      if (failure || !parsed.success) { setError(failure?.message || "Le récapitulatif n’a pas pu être calculé."); return; }
      setPreview(parsed.data.booking); setQuote(parsed.data.quote);
    } catch { setError("Connexion interrompue. Réessayez pour vérifier le récapitulatif."); }
    finally { pending.current = false; setBusy(""); }
  }
  async function confirm() {
    if (!supabase || !preview || pending.current) return;
    pending.current = true; setBusy("confirm"); setError("");
    nonce.current ??= crypto.randomUUID();
    try {
      const { data, error: failure } = await supabase.rpc("book_conversation_quote", {
        ...requestArguments(), target_client_nonce: nonce.current, target_expected_total: preview.total_amount,
      });
      const parsed = quoteBookingResultSchema.safeParse(data);
      if (failure || !parsed.success || !parsed.data.booking.id) { setError(failure?.message || "La réservation n’a pas pu être confirmée. Vous pouvez réessayer sans la dupliquer."); return; }
      setConfirmed(parsed.data.booking); setQuote(parsed.data.quote); setPreview(null);
    } catch { setError("Connexion interrompue. Réessayez : un même devis ne crée qu’un rendez-vous."); }
    finally { pending.current = false; setBusy(""); }
  }

  const isClient = quote?.client_id === userId;
  const threadHref = quote ? (isClient ? "/app/messages?conversation=" : "/pro/messages?conversation=") + quote.conversation_id : "/app/messages";
  const canBook = Boolean(quote && isClient && quoteCanBeBooked(quote, now));
  const choices = Array.from(new Map(slots.filter((s) => s.collaborator_id).map((s) => [s.collaborator_id, s])).values());
  const times = [...new Set(slots.filter((s) => !employee || s.collaborator_id === employee).map((s) => s.slot_start))];
  const canPreview = canBook && times.includes(startsAt) && (mode === "salon" || Boolean(address.trim() && position));
  const recorded = confirmed;
  return <main className="quote-booking-page">
    <header><Link href={threadHref}>← Retour à la conversation</Link><Link href="/">MATA Beauty</Link></header>
    <section className="quote-booking-card" aria-labelledby="quote-title">
      <p className="quote-eyebrow">DEVIS MATA BEAUTY</p><h1 id="quote-title">{quote?.service_title ?? "Votre devis"}</h1>
      {error && <p role="alert" className="quote-error">{error}</p>}
      {!quote && !error && <p role="status">Chargement du devis…</p>}
      {!quote && error && <button onClick={() => setReload((value) => value + 1)}>Réessayer</button>}
      {quote && <>
        <p className="quote-provider">{quote.provider_name || "Votre professionnel"} · {quoteStatusLabels[quote.status]}</p>
        <p>{quote.description}</p>
        <dl className="quote-summary"><div><dt>Prix du devis</dt><dd>{quoteMoney(quote.total_amount, quote.currency)}</dd></div>
          <div><dt>Durée prévue</dt><dd>{quote.duration_minutes} min</dd></div>
          {quote.options_amount > 0 && <div><dt>Dont options obligatoires</dt><dd>{quoteMoney(quote.options_amount, quote.currency)}</dd></div>}
          <div><dt>Validité</dt><dd>{dateLabel(quote.valid_until)}</dd></div></dl>
        {quote.conditions && <p className="quote-conditions"><strong>Conditions</strong><br />{quote.conditions}</p>}
        {recorded ? <div role="status" className="quote-confirmation"><h2>Rendez-vous enregistré</h2>
          <p>{bookingStatuses[recorded.status] ?? recorded.status}</p><p>{dateLabel(recorded.starts_at)} · {timeLabel(recorded.starts_at)} · {quoteDuration(recorded)} min</p>
          {recorded.collaborator_name && <p>Avec {recorded.collaborator_name}</p>}<p>{recorded.appointment_address}</p>
          <strong>{quoteMoney(recorded.total_amount, recorded.currency)}</strong><p>À régler sur place. Aucun paiement en ligne initié.</p>
          <Link href={"/app/bookings#booking-" + recorded.id}>Voir dans Rendez-vous</Link>
        </div> : quote.booking_id ? <p>Ce devis est déjà lié à un rendez-vous. <Link href={(isClient ? "/app/bookings#booking-" : "/pro/bookings#booking-") + quote.booking_id}>Voir le rendez-vous</Link></p>
          : !canBook ? <p>{!isClient ? "Seul le client destinataire peut réserver ce devis." : quote.status === "sent" ? "Acceptez le devis depuis la conversation pour choisir un créneau." : "Ce devis ne permet pas de nouvelle réservation. Retrouvez son statut dans la conversation."}</p>
          : preview ? <section aria-label="Récapitulatif de réservation" className="quote-recap"><h2>Vérifiez votre rendez-vous</h2>
            <p>{dateLabel(preview.starts_at)} · {timeLabel(preview.starts_at)} · {quoteDuration(preview)} min</p><p>{preview.appointment_address}</p>
            <p>{employee ? choices.find((s) => s.collaborator_id === employee)?.display_name : choices.length ? "Un professionnel disponible sera attribué." : quote.provider_name}</p>
            <dl className="quote-summary"><div><dt>Total à régler</dt><dd>{quoteMoney(preview.total_amount, preview.currency)}</dd></div>
              {mode === "client_address" && <div><dt>Dont frais de déplacement</dt><dd>{quoteMoney(preview.total_amount - quote.total_amount, preview.currency)}</dd></div>}</dl>
            <p>Le devis accepté ne constitue pas un paiement. Paiement sur place, aucun débit aujourd’hui.</p>
            <div className="quote-actions"><button disabled={Boolean(busy)} onClick={() => setPreview(null)}>Modifier</button><button className="quote-primary" disabled={Boolean(busy)} onClick={() => void confirm()}>{busy === "confirm" ? "Enregistrement…" : "Créer le rendez-vous"}</button></div>
          </section> : <section aria-label="Choisir un créneau pour le devis">
            <h2>Choisir votre rendez-vous</h2><p>Horaires du Sénégal.</p>
            <label>Date du rendez-vous<input type="date" min={new Date(now).toISOString().slice(0, 10)} value={date} onChange={(event) => { setDate(event.target.value); setStartsAt(""); setEmployee(""); invalidate(); }} /></label>
            {slotsLoading ? <p role="status">Chargement des créneaux…</p> : slotsError ? <p role="alert">{slotsError}<button onClick={() => setReload((value) => value + 1)}>Réessayer</button></p> : <>
              {choices.length > 0 && <label>Professionnel<select value={employee} onChange={(event) => { setEmployee(event.target.value); setStartsAt(""); invalidate(); }}><option value="">Attribuez-moi une personne disponible</option>{choices.map((s) => <option key={s.collaborator_id} value={s.collaborator_id ?? ""}>{s.display_name}</option>)}</select></label>}
              <div className="quote-times" role="group" aria-label="Créneaux disponibles">{times.map((time) => <button key={time} aria-pressed={startsAt === time} onClick={() => { setStartsAt(time); invalidate(); }}>{timeLabel(time)}</button>)}</div>
              {!times.length && <p>Aucun créneau disponible pour la durée de ce devis. Choisissez une autre date.</p>}
            </>}
            {quote.location_modes.length > 1 && <label>Lieu<select value={mode} onChange={(event) => { setMode(event.target.value === "client_address" ? "client_address" : "salon"); invalidate(); }}><option value="salon">Chez le professionnel</option><option value="client_address">À mon domicile</option></select></label>}
            {mode === "client_address" && <div className="quote-address"><label>Adresse complète du rendez-vous<textarea value={address} maxLength={1000} onChange={(event) => { setAddress(event.target.value); invalidate(); }} /></label>
              <button onClick={locate}>Localiser l’adresse où je me trouve</button><p>Utilisez cette action à l’adresse du rendez-vous. La zone de déplacement et les frais seront vérifiés avant confirmation.</p>{locationMessage && <p role="status">{locationMessage}</p>}</div>}
            <button className="quote-primary" disabled={!canPreview || Boolean(busy)} onClick={() => void showRecap()}>{busy === "preview" ? "Vérification…" : "Voir le récapitulatif"}</button>
          </section>}
      </>}
    </section>
  </main>;
}

