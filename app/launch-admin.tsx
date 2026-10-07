"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { loadPlatformHealth, measuredCount, measuredDeliveries, unavailableHealth } from "@/lib/admin/platform-health";

type Mode = "launch" | "cohort" | "platform-health";
type RankedMetric = { label: string; value: number };
type LaunchMetrics = { target_users: number; target_providers: number; users: number; active_clients: number; providers: number; providers_approved: number; complete_profiles: number; videos: number; bookings: number; booking_conversion: number; onboarding_abandons: number; reports: number; critical_alerts: number; reminder_jobs_pending: number; top_categories: RankedMetric[]; top_searches: RankedMetric[]; top_cities: RankedMetric[] };
type Provider = { profile_id: string; business_name: string; status: string; verified_at: string | null };
type CohortRow = { provider_id: string; is_founder: boolean; internal_note: string | null; mata_contact_id: string | null; added_at: string; business_name: string; status: string; verified_at: string | null; onboarding_status: string | null; completeness: number; services_count: number; published_content: number; first_booking_at: string | null; last_activity_at: string | null };

const deployedVersion = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

function ProgressGoal({ label, value, target }: { label: string; value: number; target: number }) {
  const percent = Math.min(100, Math.round(value / Math.max(target, 1) * 100));
  return <article className="launch-goal"><div><span>{label}</span><strong>{value} / {target}</strong></div><progress max="100" value={percent} /><small>{percent}% de l’objectif lancement</small></article>;
}

export function LaunchAdmin({ mode }: { mode: Mode }) {
  const [metrics, setMetrics] = useState<LaunchMetrics | null>(null);
  const [cohort, setCohort] = useState<CohortRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [health, setHealth] = useState(unavailableHealth);
  const [measuredAt, setMeasuredAt] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const deliveryHealth = health.deliveries;
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    setLoading(true); setNotice(""); setLoadError("");
    setHealth(unavailableHealth); setMeasuredAt(null);
    if (!client) { setNotice("Connexion aux données indisponible."); setLoading(false); return; }
    try {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      if (mode === "platform-health") {
        const result = await loadPlatformHealth({
          server: async () => {
            const response = await fetch("/api/health/server", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
            const data: unknown = await response.json();
            if (!data || typeof data !== "object" || !("ok" in data) || typeof data.ok !== "boolean") throw new Error("Réponse santé invalide");
            if (!response.ok && response.status !== 503) throw new Error("Sonde indisponible");
            return data.ok;
          },
          bookings24h: async () => measuredCount(await client.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", since)),
          uploads24h: async () => measuredCount(await client.from("posts").select("id", { count: "exact", head: true }).gte("created_at", since)),
          criticalAlerts: async () => measuredCount(await client.from("fraud_alerts").select("id", { count: "exact", head: true }).eq("severity", "critical").in("status", ["open", "reviewing"])),
          deliveries: async () => { const result = await client.rpc("notification_delivery_health"); if (result.error) throw result.error; return measuredDeliveries(result.data); },
        });
        setHealth(result); setMeasuredAt(new Date().toLocaleString("fr-FR"));
        if (Object.values(result).some(value => value === null)) setNotice("Certaines mesures sont indisponibles. Aucune valeur de remplacement n’est affichée.");
        return;
      }
      setMetrics(null);
      const providerRows = await client.from("provider_profiles").select("profile_id,business_name,status,verified_at").order("created_at", { ascending: true }).limit(100);
      if (providerRows.error) throw providerRows.error;
      setProviders(providerRows.data as Provider[]);
      if (mode === "cohort") {
        const cohortRows = await client.rpc("get_launch_provider_cohort").abortSignal(AbortSignal.timeout(10000));
        if (cohortRows.error) throw cohortRows.error;
        setCohort(cohortRows.data as unknown as CohortRow[]);
      } else {
        const dashboard = await client.rpc("get_launch_dashboard");
        if (dashboard.error || !dashboard.data) throw dashboard.error ?? new Error("Mesures absentes");
        setMetrics(dashboard.data as LaunchMetrics);
      }
    } catch (error) { const message = publicErrorMessage(error, "Données indisponibles. Le chargement a échoué ; aucune mesure ne peut être affichée."); setNotice(message); setLoadError(message); }
    finally { setLoading(false); }
  }, [mode]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const cohortIds = useMemo(() => new Set(cohort.map((item) => item.provider_id)), [cohort]);

  async function addToCohort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const providerId = String(data.get("providerId") ?? "");
    const client = getSupabaseBrowserClient(); if (!client || !providerId) return;
    const user = await client.auth.getUser();
    const { error } = await client.from("launch_provider_cohort").insert({ provider_id: providerId, is_founder: data.get("founder") === "on", internal_note: String(data.get("note") ?? "").trim() || null, added_by: user.data.user?.id });
    if (error) setNotice(publicErrorMessage(error, "Ajout impossible.")); else { const badge = await client.rpc("sync_founder_badge", { target_provider_id: providerId }); form.reset(); await load(); setNotice(badge.error ? "Prestataire ajouté, mais le badge n’a pas pu être vérifié. Actualisez avant de réessayer." : "Prestataire ajouté à la cohorte lancement."); }
  }

  async function toggleFounder(row: CohortRow) {
    const client = getSupabaseBrowserClient(); if (!client) return;
    const { error } = await client.from("launch_provider_cohort").update({ is_founder: !row.is_founder, updated_at: new Date().toISOString() }).eq("provider_id", row.provider_id);
    if (error) { setNotice("Le statut fondateur n’a pas été modifié."); return; }
    const badge = await client.rpc("sync_founder_badge", { target_provider_id: row.provider_id });
    await load(); setNotice(badge.error ? "Le statut est enregistré, mais le badge n’a pas pu être vérifié." : "Statut fondateur mis à jour. Le badge public dépend des critères d’éligibilité.");
  }

  async function createLaunchCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget; const values=new FormData(form); const client=getSupabaseBrowserClient(); if(!client)return;
    const startsAt=new Date(String(values.get("startsAt"))).toISOString(); const endsAt=new Date(String(values.get("endsAt"))).toISOString();
    const {error}=await client.from("promotions").insert({provider_id:String(values.get("providerId")),title:String(values.get("title")),description:String(values.get("description")??"")||null,discount_type:String(values.get("discountType")),discount_value:Number(values.get("discountValue")),starts_at:startsAt,ends_at:endsAt,is_active:false,campaign_kind:String(values.get("campaignKind")),auto_apply:false,launch_configuration:{created_from:"launch_dashboard",requires_explicit_activation:true}});
    setNotice(error?publicErrorMessage(error,"Le brouillon de campagne n’a pas été créé."):"Campagne créée en brouillon, sans remise automatique."); if(!error)form.reset();
  }

  if (loading) return <div className="admin-panel compact-empty">Chargement du pilotage lancement…</div>;

  if (mode === "platform-health") return <section className="admin-module launch-admin"><header><div><span>SURVEILLANCE LANCEMENT</span><h2>Santé de la plateforme</h2><p>Signaux opérationnels essentiels, sans données personnelles.</p></div><button onClick={() => void load()}>Actualiser</button></header>{notice && <p className="admin-feedback">{notice}</p>}<div className="health-grid">
    <article><span>Application</span><strong className={health.server ? "healthy" : "critical"}>{health.server === null ? "Indisponible" : health.server ? "Opérationnelle" : "Incident"}</strong><small>Base de données · connexion serveur</small></article>
    <article><span>Réservations 24 h</span><strong>{health.bookings24h ?? "Indisponible"}</strong><small>Créations réelles</small></article><article><span>Uploads 24 h</span><strong>{health.uploads24h ?? "Indisponible"}</strong><small>Publications enregistrées</small></article>
    <article><span>Notifications 24 h</span><strong>{deliveryHealth?.notifications24h ?? "Indisponible"}</strong><small>Internes</small></article><article><span>Alertes critiques</span><strong className={health.criticalAlerts ? "critical" : "healthy"}>{health.criticalAlerts ?? "Indisponible"}</strong><small>Anti-fraude ouvertes</small></article><article><span>Version Production</span><strong>{deployedVersion}</strong><small>Version déclarée par le déploiement</small></article>
    <><article><span>E-mails en attente</span><strong>{deliveryHealth?.pending ?? "Indisponible"}</strong><small>Transactionnels, traitement automatique</small></article><article><span>E-mails envoyés</span><strong>{deliveryHealth?.sent ?? "Indisponible"}</strong><small>Acceptés par le service d’envoi</small></article><article><span>E-mails à reprendre</span><strong className={deliveryHealth?.failed ? "critical" : "healthy"}>{deliveryHealth?.failed ?? "Indisponible"}</strong><small>Nouvelle tentative automatique</small></article><article><span>E-mails à vérifier</span><strong className={deliveryHealth?.needsReview ? "critical" : "healthy"}>{deliveryHealth?.needsReview ?? "Indisponible"}</strong><small>Intervention technique requise ; aucun renvoi aveugle</small></article></>
  </div>{measuredAt && mode === "platform-health" && <p>Dernière mesure : {measuredAt}</p>}</section>;

  if (loadError || (mode === "launch" && !metrics)) return <section className="admin-panel"><h2>{mode === "cohort" ? "Cohorte lancement" : "Lancement"}</h2><p role="alert">{loadError || "Indisponible"}</p><button onClick={() => void load()}>Réessayer</button></section>;

  if (mode === "cohort") return <section className="admin-module launch-admin"><header><div><span>20 PROFESSIONNELS FONDATEURS</span><h2>Cohorte lancement</h2><p>Accompagnez les premiers professionnels sans exposer de données inutiles.</p></div></header>{notice && <p className="admin-feedback">{notice}</p>}<form className="launch-cohort-form" onSubmit={(event) => void addToCohort(event)}><select name="providerId" required defaultValue=""><option value="">Choisir un prestataire</option>{providers.filter((item) => !cohortIds.has(item.profile_id)).map((item) => <option key={item.profile_id} value={item.profile_id}>{item.business_name} · {item.status}</option>)}</select><input name="note" maxLength={2000} placeholder="Note interne de suivi"/><label><input name="founder" type="checkbox"/> Professionnel fondateur</label><button>Ajouter</button></form><div className="cohort-list">{cohort.map((row) => <article key={row.provider_id}><div><strong>{row.business_name}</strong><small>{row.status} · {row.verified_at ? "Vérifié" : "Vérification en attente"} · {row.completeness}%</small><small>{row.onboarding_status ?? "onboarding inconnu"} · {row.services_count} prestations · {row.published_content} contenus</small><small>Première réservation : {row.first_booking_at ? new Date(row.first_booking_at).toLocaleDateString("fr-FR") : "—"} · Dernière activité : {row.last_activity_at ? new Date(row.last_activity_at).toLocaleDateString("fr-FR") : "—"}</small>{row.internal_note && <p>{row.internal_note}</p>}</div><button onClick={() => void toggleFounder(row)}>{row.is_founder ? "★ Fondateur" : "Activer le badge"}</button></article>)}{cohort.length === 0 && <div className="compact-empty">Aucun professionnel dans la cohorte.</div>}</div></section>;

  if (!metrics) return null;
  return <section className="admin-module launch-admin"><header><div><span>PILOTAGE COMMERCIAL</span><h2>Lancement</h2><p>Objectifs 100 utilisateurs et 20 professionnels, calculés depuis Supabase.</p></div><button onClick={() => void load()}>Actualiser</button></header>{notice && <p className="admin-feedback">{notice}</p>}<div className="launch-goals"><ProgressGoal label="Utilisateurs" value={metrics.users} target={metrics.target_users}/><ProgressGoal label="Professionnels validés" value={metrics.providers_approved} target={metrics.target_providers}/></div><div className="launch-metrics">{[
    ["Clients actifs",metrics.active_clients],["Prestataires inscrits",metrics.providers],["Profils complets",metrics.complete_profiles],["Vidéos publiées",metrics.videos],["Réservations",metrics.bookings],["Conversion",`${metrics.booking_conversion}%`],["Abandons onboarding",metrics.onboarding_abandons],["Signalements",metrics.reports],["Alertes critiques",metrics.critical_alerts],["Rappels en attente",metrics.reminder_jobs_pending],
  ].map(([label,value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><div className="launch-rankings">{([['Catégories vues',metrics.top_categories],['Recherches',metrics.top_searches],['Villes',metrics.top_cities]] as Array<[string,RankedMetric[]]>).map(([title,items])=><article key={title}><h3>{title}</h3>{items.length?items.map((item)=><p key={item.label}><span>{item.label}</span><strong>{item.value}</strong></p>):<small>Pas encore de données.</small>}</article>)}</div><form className="launch-cohort-form" onSubmit={(event)=>void createLaunchCampaign(event)}><select name="campaignKind" required><option value="first_booking">Première réservation</option><option value="new_client">Nouveau client / cliente</option><option value="new_provider">Nouveaux prestataires</option><option value="category">Offre par catégorie</option><option value="local">Offre locale</option></select><select name="providerId" required defaultValue=""><option value="">Prestataire porteur</option>{providers.map((provider)=><option key={provider.profile_id} value={provider.profile_id}>{provider.business_name}</option>)}</select><input name="title" required minLength={2} maxLength={120} placeholder="Titre de campagne"/><input name="description" maxLength={1000} placeholder="Description"/><select name="discountType"><option value="percentage">Pourcentage</option><option value="fixed">Montant fixe</option></select><input name="discountValue" type="number" min="1" max="100" required placeholder="Valeur"/><input name="startsAt" type="datetime-local" required/><input name="endsAt" type="datetime-local" required/><button>Créer le brouillon</button><small>Aucune remise n’est activée ou appliquée automatiquement.</small></form></section>;
}
