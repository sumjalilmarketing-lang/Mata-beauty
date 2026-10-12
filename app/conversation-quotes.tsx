"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { conversationDate, conversationPrice, type ConversationQuote, type ConversationService } from "./conversation-types";

const quoteStatuses: Record<string, string> = { draft: "Brouillon", sent: "Envoyé", accepted: "Accepté", declined: "Refusé", expired: "Expiré", cancelled: "Annulé" };

export function ConversationQuoteCard({ quote, userId, onChanged, onEdit }: {
  quote: ConversationQuote; userId: string; onChanged: () => void; onEdit?: (quote: ConversationQuote) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"send" | "accept" | "decline" | "cancel" | null>(null);
  const lock = useRef(false);
  const nonces = useRef(new Map<string, string>());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const expired = !quote.booking_id && ["sent", "accepted"].includes(quote.status) && Date.parse(quote.valid_until) <= now;
  const status = expired ? "expired" : quote.status;
  const isProvider = quote.provider_id === userId;
  const isClient = quote.client_id === userId;

  async function act(action: "send" | "accept" | "decline" | "cancel") {
    const client = getSupabaseBrowserClient(); if (!client || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const key = `${action}:${quote.version}`;
    if (!nonces.current.has(key)) nonces.current.set(key, crypto.randomUUID());
    const common = { target_quote_id: quote.id, target_expected_version: quote.version };
    try {
      const result = action === "cancel"
        ? await client.rpc("cancel_conversation_quote", common)
        : action === "send"
          ? await client.rpc("send_conversation_quote", { ...common, target_client_nonce: nonces.current.get(key)! })
          : await client.rpc("respond_to_conversation_quote", { ...common, target_decision: action, target_client_nonce: nonces.current.get(key)! });
      if (result.error) throw result.error;
      setConfirmation(null); onChanged();
    } catch (caught) {
      setError(publicErrorMessage(caught, "Le devis n’a pas pu être mis à jour. Son statut ou sa validité a peut-être changé. Actualisez la conversation avant de réessayer."));
      onChanged();
    } finally { lock.current = false; setBusy(false); }
  }

  return <section className="conversation-quote-card" aria-label={`Devis ${quote.service_title}`}>
    <div className="conversation-card-heading"><strong>Devis personnalisé</strong><span className="conversation-quote-status">{quoteStatuses[status] ?? status}</span></div>
    <h3>{quote.service_title}</h3>
    <p>{quote.description}</p>
    <dl>
      <div><dt>Prestation</dt><dd>{conversationPrice(quote.base_amount, quote.currency)}</dd></div>
      {quote.options_amount > 0 && <div><dt>Options obligatoires</dt><dd>{conversationPrice(quote.options_amount, quote.currency)}</dd></div>}
      <div><dt>Total</dt><dd><strong>{conversationPrice(quote.total_amount, quote.currency)}</strong></dd></div>
      <div><dt>Durée</dt><dd>{quote.duration_minutes} min</dd></div>
      <div><dt>Valable jusqu’au</dt><dd>{conversationDate(quote.valid_until)}</dd></div>
    </dl>
    {quote.conditions && <p className="conversation-quote-conditions">{quote.conditions}</p>}
    {quote.location_modes?.includes("client_address") && <p className="conversation-quote-conditions">À domicile : déplacement en supplément selon l’adresse.{(quote.fixed_travel_fee_amount ?? 0) > 0 ? ` Forfait : ${conversationPrice(quote.fixed_travel_fee_amount!, quote.currency)}.` : ""} Le montant complet sera confirmé avant la réservation.</p>}
    <small>Version {quote.version}. L’acceptation ne réserve pas de créneau et ne constitue pas un paiement.</small>
    <div className="conversation-actions">
      {isProvider && status === "draft" && <><button type="button" disabled={busy} onClick={() => onEdit?.(quote)}>Modifier le brouillon</button><button className="primary-button" type="button" disabled={busy} onClick={() => setConfirmation("send")}>Envoyer le devis</button></>}
      {isClient && status === "sent" && <><button className="primary-button" type="button" disabled={busy} onClick={() => setConfirmation("accept")}>Accepter le devis</button><button type="button" disabled={busy} onClick={() => setConfirmation("decline")}>Refuser le devis</button></>}
      {isProvider && ["draft", "sent", "accepted"].includes(status) && !quote.booking_id && <button type="button" disabled={busy} onClick={() => setConfirmation("cancel")}>Annuler le devis</button>}
      {isClient && status === "accepted" && !quote.booking_id && <a className="primary-button" href={`/quotes/${encodeURIComponent(quote.id)}`}>Choisir un créneau et réserver</a>}
      {quote.booking_id && <a href={`${isProvider ? "/pro/bookings" : "/app/bookings"}#booking-${encodeURIComponent(quote.booking_id)}`}>Voir le rendez-vous</a>}
    </div>
    {confirmation && <div className="conversation-confirm" role="group" aria-label="Confirmer la décision sur le devis">
      <p>{confirmation === "accept" ? `Accepter ce devis de ${conversationPrice(quote.total_amount, quote.currency)} et ses conditions ?` : confirmation === "send" ? "Envoyer ce devis au client ? Vérifiez le montant, la durée et les conditions avant confirmation." : confirmation === "decline" ? "Refuser ce devis ?" : "Annuler ce devis ? Il ne pourra plus être réservé."}</p>
      <button className="primary-button" type="button" disabled={busy} onClick={() => void act(confirmation)}>{busy ? "Traitement…" : "Confirmer"}</button>
      <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Retour</button>
    </div>}
    {error && <p role="alert" className="conversation-error">{error}</p>}
  </section>;
}

function localDateInput(value: string) {
  const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ConversationQuoteForm({ conversationId, services, existing, onSaved, onClose }: {
  conversationId: string; services: ConversationService[]; existing: ConversationQuote | null; onSaved: () => void; onClose: () => void;
}) {
  const initial = services.find(service => service.id === existing?.provider_service_id) ?? services[0];
  const [serviceId, setServiceId] = useState(initial?.id ?? "");
  const [amount, setAmount] = useState(String(existing?.base_amount ?? initial?.price_amount ?? ""));
  const [duration, setDuration] = useState(String(existing?.base_duration_minutes ?? initial?.duration_minutes ?? ""));
  const [validUntil] = useState(() => localDateInput(existing?.valid_until ?? new Date(Date.now() + 7 * 86400000).toISOString()));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const request = useRef<{ payload: string; nonce: string } | null>(null);
  const selected = services.find(service => service.id === serviceId);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const client = getSupabaseBrowserClient(); if (!client || lock.current) return;
    const form = new FormData(event.currentTarget);
    const valid = new Date(String(form.get("validUntil")));
    if (!Number.isFinite(valid.getTime()) || valid.getTime() <= Date.now()) { setError("Choisissez une date de validité future."); return; }
    const args = {
      target_conversation_id: conversationId, target_provider_service_id: serviceId,
      target_description: String(form.get("description") ?? "").trim(),
      target_base_amount: Number(amount), target_base_duration_minutes: Number(duration),
      target_valid_until: valid.toISOString(), target_conditions: String(form.get("conditions") ?? "").trim(),
      target_quote_id: existing?.id ?? null, target_expected_version: existing?.version ?? null,
    };
    const payload = JSON.stringify(args);
    if (request.current?.payload !== payload) request.current = { payload, nonce: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await client.rpc("save_conversation_quote", { ...args, target_client_nonce: request.current.nonce });
      if (result.error) throw result.error;
      onSaved();
    } catch (caught) { setError(publicErrorMessage(caught, "Impossible d’enregistrer ce devis. Vérifiez la prestation, les montants et la validité. Votre saisie est conservée.")); }
    finally { lock.current = false; setBusy(false); }
  }

  return <form className="conversation-quote-form" onSubmit={event => void save(event)} aria-label="Créer ou modifier un devis">
    <h3>{existing ? "Modifier le devis" : "Créer un devis personnalisé"}</h3>
    <label>Prestation<select required value={serviceId} disabled={busy} onChange={event => {
      setServiceId(event.target.value); const service = services.find(item => item.id === event.target.value);
      if (service) { setAmount(String(service.price_amount)); setDuration(String(service.duration_minutes)); }
    }}><option value="">Choisir une prestation</option>{services.map(service => <option key={service.id} value={service.id}>{service.title}</option>)}</select></label>
    <label>Description personnalisée<textarea name="description" required minLength={3} maxLength={2000} rows={3} defaultValue={existing?.description ?? ""} disabled={busy} /></label>
    <div className="conversation-form-columns">
      <label>Prix de base ({selected?.currency ?? "devise du catalogue"})<input type="number" min={0} max={100000000} step={1} required value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} /></label>
      <label>Durée de base (minutes)<input type="number" min={5} max={720} step={1} required value={duration} onChange={event => setDuration(event.target.value)} disabled={busy} /></label>
    </div>
    <small>Les options obligatoires sont ajoutées par le serveur. Vérifiez le total du brouillon avant de l’envoyer.</small>
    <label>Valable jusqu’au<input name="validUntil" type="datetime-local" required defaultValue={validUntil} disabled={busy} /></label>
    <label>Conditions<textarea name="conditions" maxLength={2000} rows={2} defaultValue={existing?.conditions ?? ""} disabled={busy} /></label>
    {error && <p className="conversation-error" role="alert">{error}</p>}
    <div className="conversation-actions"><button className="primary-button" type="submit" disabled={busy || !selected}>{busy ? "Enregistrement…" : "Enregistrer le brouillon"}</button><button type="button" disabled={busy} onClick={onClose}>Fermer</button></div>
  </form>;
}
