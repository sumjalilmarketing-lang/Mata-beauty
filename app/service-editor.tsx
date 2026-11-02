"use client";

import { FormEvent, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { serviceDetailsError } from "@/lib/domain/service-creation";
import { formatServiceMoney } from "@/lib/domain/service-money";
import { publicErrorMessage } from "@/lib/ui/public-error";
import "./service-editor.css";

export type EditableService = { id: string; service_id: string; title: string; description: string | null; duration_minutes: number; price_amount: number; currency: string; is_active: boolean; archived_at: string | null; updated_at: string };
export function ServiceEditor({ service, catalog, userId, businessId, activityCurrency, onSaved, onRemoved }: {
  service: EditableService; catalog: Array<{ id: string; name: string }>; userId: string; businessId?: string;
  activityCurrency: string | null; onSaved: (value: EditableService) => void; onRemoved: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const currency = activityCurrency || service.currency;
  const currencyChanged = currency !== service.currency;

  async function persist(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (pending.current) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setMessage("Connexion indisponible. Réessayez."); return; }
    const values = event ? new FormData(event.currentTarget) : null;
    const details = values ? { serviceId: String(values.get("serviceId") ?? ""), title: String(values.get("title") ?? "").trim(), durationMinutes: Number(values.get("duration")), priceAmount: Number(values.get("price")) } : null;
    if (details) { const error = serviceDetailsError(details); if (error) { setMessage(error); return; } }
    const payload = details ? { service_id: details.serviceId, title: details.title, description: String(values?.get("description") ?? "").trim() || null, duration_minutes: details.durationMinutes, price_amount: details.priceAmount, currency } : { is_active: false, archived_at: new Date().toISOString() };
    pending.current = true; setBusy(true); setMessage("");
    try {
      let query = supabase.from("provider_services").update(payload).eq("id", service.id).eq("provider_id", userId).eq("updated_at", service.updated_at).is("archived_at", null);
      query = businessId ? query.eq("business_id", businessId) : query.is("business_id", null);
      const { data, error } = await query.select("id,service_id,title,description,duration_minutes,price_amount,currency,is_active,archived_at,updated_at").maybeSingle();
      if (error) throw error;
      if (!data) { setMessage("Cette prestation a changé ou n’est plus accessible. Actualisez la page avant de réessayer."); return; }
      if (details) { onSaved(data as EditableService); setEditing(false); setMessage("Prestation modifiée. Les dates, durées et montants des réservations existantes restent inchangés."); }
      else onRemoved(service.id);
    } catch (error) { setMessage(publicErrorMessage(error, "Enregistrement impossible. Vos modifications sont conservées.")); }
    finally { pending.current = false; setBusy(false); }
  }

  return <section className="service-editor" aria-label={`Prestation ${service.title}`}>
    <div className="service-editor-summary"><strong>{service.title}</strong><span>{service.duration_minutes} min · {formatServiceMoney(service.price_amount, service.currency)} · {service.is_active ? "Active" : "Inactive"}</span></div>
    {currencyChanged && <p className="service-editor-warning">Cette prestation est en {service.currency}, alors que votre activité est en {currency}. Modifiez son prix pour corriger la devise. Aucun montant n’est converti automatiquement.</p>}
    {!editing && !removing && <div className="service-editor-actions"><button type="button" onClick={() => { setMessage(""); setEditing(true); }}>Modifier</button><button type="button" className="service-editor-danger" onClick={() => { setMessage(""); setRemoving(true); }}>Supprimer</button></div>}
    {editing && <form onSubmit={event => void persist(event)}>
      <label>Catégorie<select name="serviceId" defaultValue={service.service_id} required disabled={busy}>{!catalog.some(item => item.id === service.service_id) && <option value={service.service_id}>Catégorie actuelle</option>}{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Nom de votre prestation<input name="title" defaultValue={service.title} required minLength={2} maxLength={120} disabled={busy} /></label>
      <label>Durée (minutes)<input name="duration" type="number" inputMode="numeric" defaultValue={service.duration_minutes} required min={15} max={720} step={1} disabled={busy} /></label>
      <label>Prix ({currency})<input key={currency} name="price" type="number" inputMode="numeric" defaultValue={currencyChanged ? "" : service.price_amount} required min={0} max={10000000} step={1} disabled={busy} /></label>
      <label>Description<textarea name="description" defaultValue={service.description ?? ""} maxLength={2000} disabled={busy} /></label>
      <p>Les modifications s’appliquent aux prochaines réservations. Les rendez-vous déjà réservés conservent leurs dates, durées et montants.</p>
      <div className="service-editor-actions"><button type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les modifications"}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Annuler</button></div>
    </form>}
    {removing && <div className="service-editor-confirm"><p>Supprimer « {service.title} » du catalogue ? Cette prestation ne pourra plus être réservée. Les réservations et leur historique seront conservés.</p><div className="service-editor-actions"><button type="button" className="service-editor-danger" disabled={busy} onClick={() => void persist()}>{busy ? "Suppression…" : "Oui, supprimer la prestation"}</button><button type="button" disabled={busy} onClick={() => setRemoving(false)}>Annuler</button></div></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
