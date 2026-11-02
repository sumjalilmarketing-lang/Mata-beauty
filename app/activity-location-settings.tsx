"use client";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SUPPORTED_COUNTRIES, SUPPORTED_CURRENCIES, SUPPORTED_TIME_ZONES } from "@/lib/domain/international";
import { activityLocationReady, type ActivityLocation } from "@/lib/domain/service-creation";
import { publicErrorMessage } from "@/lib/ui/public-error";
import "./activity-location-settings.css";

export function ActivityLocationSettings({ value, businessId, onSaved }: { value: ActivityLocation; businessId?: string; onSaved: (value: ActivityLocation) => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(!activityLocationReady(value));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const values = new FormData(event.currentTarget);
    const next = { country_code: String(values.get("countryCode")), timezone: String(values.get("timezone")), currency: String(values.get("currency")), region: value.region ?? null };
    const client = getSupabaseBrowserClient(); if (!client) { setNotice("Reconnectez-vous pour enregistrer votre activité."); return; }
    setBusy(true); setNotice("");
    try {
      const parameters = { target_country_code: next.country_code, target_region: next.region ?? "", target_timezone: next.timezone, target_currency: next.currency };
      const { error } = businessId
        ? await client.rpc("save_business_global_location", { ...parameters, target_business_id: businessId })
        : await client.rpc("save_professional_global_location", parameters);
      if (error) throw error;
      onSaved(next); setEditing(false); setNotice("Activité enregistrée. Vous pouvez maintenant ajouter votre prestation ci-dessous.");
    } catch (error) { setNotice(publicErrorMessage(error, "Les réglages n’ont pas pu être enregistrés. Réessayez.")); }
    finally { setBusy(false); }
  }
  return <section className="activity-location-settings" aria-label="Pays, fuseau horaire et devise de l’activité">
    <h3>Pays, horaires et devise de votre activité</h3>
    <p>Ces réglages servent à afficher les bons horaires et tarifs. Choisissez les valeurs de votre activité.</p>
    {editing ? <form onSubmit={event => void save(event)}>
      <label>Pays<select name="countryCode" required defaultValue={value.country_code ?? ""}><option value="" disabled>Choisir le pays</option>{SUPPORTED_COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
      <label>Fuseau horaire<select name="timezone" required defaultValue={value.timezone ?? ""}><option value="" disabled>Choisir le fuseau horaire</option>{[...new Set([...SUPPORTED_TIME_ZONES, ...(value.timezone ? [value.timezone] : [])])].map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
      <label>Devise<select name="currency" required defaultValue={value.currency ?? ""}><option value="" disabled>Choisir la devise</option>{SUPPORTED_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>
      <button type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les réglages de l’activité"}</button>
    </form> : <><p>{value.country_code} · {value.timezone} · {value.currency}</p><button type="button" onClick={() => setEditing(true)}>Modifier ces réglages</button></>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
