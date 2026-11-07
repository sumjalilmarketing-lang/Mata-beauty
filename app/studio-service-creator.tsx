"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { activityLocationReady, serviceDetailsError } from "@/lib/domain/service-creation";
import { serviceReference } from "@/lib/domain/service-reference";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Service = { id: string; title: string; duration_minutes: number; price_amount: number; currency: string; services: { categories: { name: string } | null } | null };
type Context = { id?: string; name?: string; currency: string | null; country_code: string | null; timezone: string | null };

export function StudioServiceCreator({ userId, salon, providerApproved, onCreated, onCancel }: { userId: string; salon: boolean; providerApproved: boolean; onCreated: (service: Service) => void; onCancel: () => void }) {
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string }>>([]);
  const [businesses, setBusinesses] = useState<Context[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.scrollIntoView({ behavior: "smooth", block: "center" }); panel.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    let live = true;
    const client = getSupabaseBrowserClient();
    if (!client) { const timer = window.setTimeout(() => { setLoading(false); setMessage("Connexion indisponible. Fermez puis réessayez."); }, 0); return () => window.clearTimeout(timer); }
    void (async () => {
      try {
        const [references, settings] = await Promise.all([
          client.from("services").select("id,name").eq("is_active", true).order("name").abortSignal(AbortSignal.timeout(15000)),
          salon ? client.from("businesses").select("id,name,currency,country_code,timezone").eq("owner_id", userId).is("archived_at", null).order("name").abortSignal(AbortSignal.timeout(15000))
            : client.from("provider_profiles").select("currency,country_code,timezone").eq("profile_id", userId).abortSignal(AbortSignal.timeout(15000)).maybeSingle(),
        ]);
        if (references.error) throw references.error;
        if (settings.error) throw settings.error;
        if (live) { setCatalog(references.data ?? []); if (salon) { const rows = (settings.data ?? []) as Context[]; setBusinesses(rows); setContext(rows.length === 1 ? rows[0] : null); } else setContext(settings.data as Context | null); }
      } catch { if (live) setMessage("Les réglages de votre activité sont indisponibles. Fermez puis réessayez."); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [salon, userId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || loading) return;
    const values = new FormData(event.currentTarget);
    const details = { serviceId: serviceReference(values.get("category"), catalog), title: String(values.get("serviceTitle") ?? "").trim(), durationMinutes: Number(values.get("serviceDuration")), priceAmount: Number(values.get("servicePrice")) };
    const invalid = serviceDetailsError(details);
    if (invalid) { setMessage(invalid); return; }
    if (!activityLocationReady(context) || !context?.currency || (salon && !context.id)) { setMessage("Le pays, le fuseau horaire et la devise de votre activité doivent être renseignés avant de créer une prestation."); return; }
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage("Connexion indisponible. Réessayez."); return; }
    pending.current = true; setBusy(true); setMessage("");
    try {
      const payload = { provider_id: userId, business_id: salon ? context.id : null, service_id: details.serviceId, title: details.title, duration_minutes: details.durationMinutes, price_amount: details.priceAmount, currency: context.currency, is_active: providerApproved, status: providerApproved ? "published" : "draft" };
      const { data, error } = await client.from("provider_services").insert(payload).select("id,title,duration_minutes,price_amount,currency,services(categories(name))").abortSignal(AbortSignal.timeout(20000)).single();
      if (error) throw error;
      if (!data) throw new Error("Enregistrement non confirmé.");
      onCreated(data as unknown as Service);
    } catch (error) { setMessage(publicErrorMessage(error, "Création non confirmée. Vos champs sont conservés ; vérifiez le catalogue avant de réessayer.")); }
    finally { pending.current = false; setBusy(false); }
  }

  return <section ref={panel} tabIndex={-1} className="studio-inline-service" aria-label="Nouvelle prestation du Studio">
    <h3>Ajouter une prestation</h3><p>Elle sera enregistrée dans votre catalogue et associée à cette publication.</p>
    {loading ? <p role="status">Chargement de votre activité…</p> : <form onSubmit={event => void create(event)}>
      <fieldset disabled={busy}>
        {salon && <label>Salon de la prestation<select aria-label="Salon de la prestation" required value={context?.id ?? ""} onChange={event => setContext(businesses.find(item => item.id === event.target.value) ?? null)}><option value="">Choisir votre salon</option>{businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label>Catégorie<select name="category" defaultValue=""><option value="">Prestation personnalisée</option>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Nom de la prestation<input name="serviceTitle" required minLength={2} maxLength={120} /></label>
        <label>Durée de la prestation (minutes)<input name="serviceDuration" type="number" min={15} max={720} step={1} defaultValue={60} required /></label>
        <label>Prix ({context?.currency ?? "devise de votre activité"})<input name="servicePrice" type="number" min={0} max={10000000} step={1} required /></label>
        <button type="submit" disabled={!context || !catalog.length}>{busy ? "Enregistrement…" : "Enregistrer et associer"}</button>
      </fieldset>
    </form>}
    <button type="button" disabled={busy} onClick={onCancel}>Fermer</button>
    {message && <p role="alert">{message}</p>}
  </section>;
}
