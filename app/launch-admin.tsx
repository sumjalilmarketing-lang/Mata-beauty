"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Mode = "launch" | "cohort" | "platform-health";
type RankedMetric = { label: string; value: number };
type LaunchMetrics = { target_users: number; target_providers: number; users: number; active_clients: number; providers: number; providers_approved: number; complete_profiles: number; videos: number; bookings: number; booking_conversion: number; onboarding_abandons: number; reports: number; critical_alerts: number; reminder_jobs_pending: number; top_categories: RankedMetric[]; top_searches: RankedMetric[]; top_cities: RankedMetric[] };
type Provider = { profile_id: string; business_name: string; status: string; verified_at: string | null };
type CohortRow = { provider_id: string; is_founder: boolean; internal_note: string | null; mata_contact_id: string | null; added_at: string; business_name: string; status: string; verified_at: string | null; onboarding_status: string | null; completeness: number; services_count: number; published_content: number; first_booking_at: string | null; last_activity_at: string | null };

const emptyMetrics: LaunchMetrics = { target_users: 100, target_providers: 20, users: 0, active_clients: 0, providers: 0, providers_approved: 0, complete_profiles: 0, videos: 0, bookings: 0, booking_conversion: 0, onboarding_abandons: 0, reports: 0, critical_alerts: 0, reminder_jobs_pending: 0, top_categories: [], top_searches: [], top_cities: [] };
const deployedVersion = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

function ProgressGoal({ label, value, target }: { label: string; value: number; target: number }) {
  const percent = Math.min(100, Math.round(value / Math.max(target, 1) * 100));
  return <article className="launch-goal"><div><span>{label}</span><strong>{value} / {target}</strong></div><progress max="100" value={percent} /><small>{percent}% de l’objectif lancement</small></article>;
}

export function LaunchAdmin({ mode }: { mode: Mode }) {
  const [metrics, setMetrics] = useState<LaunchMetrics>(emptyMetrics);
  const [cohort, setCohort] = useState<CohortRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [health, setHealth] = useState({ server: false, bookings24h: 0, uploads24h: 0, notifications24h: 0, criticalAlerts: 0, version: deployedVersion });
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setLoading(true); setNotice("");
    try {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [dashboard, cohortRows, providerRows, bookings, uploads, notifications, alerts, server] = await Promise.all([
        client.rpc("get_launch_dashboard"),
        client.from("launch_provider_cohort_overview").select("*").order("added_at"),
        client.from("provider_profiles").select("profile_id,business_name,status,verified_at").order("created_at", { ascending: true }).limit(100),
        client.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", since),
        client.from("posts").select("id", { count: "exact", head: true }).gte("created_at", since),
        client.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", since),
        client.from("fraud_alerts").select("id", { count: "exact", head: true }).eq("severity", "critical").in("status", ["open", "reviewing"]),
        fetch("/api/health/server", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<{ ok: boolean }> : { ok: false }),
      ]);
      if (dashboard.error) throw dashboard.error;
      setMetrics(dashboard.data as LaunchMetrics);
      setCohort((cohortRows.data ?? []) as unknown as CohortRow[]);
      setProviders((providerRows.data ?? []) as Provider[]);
      setHealth({ server: Boolean(server.ok), bookings24h: bookings.count ?? 0, uploads24h: uploads.count ?? 0, notifications24h: notifications.count ?? 0, criticalAlerts: alerts.count ?? 0, version: deployedVersion });
    } catch (error) { setNotice(publicErrorMessage(error, "Les données lancement nécessitent la migration Phase 2.")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const cohortIds = useMemo(() => new Set(cohort.map((item) => item.provider_id)), [cohort]);

  async function addToCohort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const providerId = String(data.get("providerId") ?? "");
    const client = getSupabaseBrowserClient(); if (!client || !providerId) return;
    const user = await client.auth.getUser();
    const { error } = await client.from("launch_provider_cohort").insert({ provider_id: providerId, is_founder: data.get("founder") === "on", internal_note: String(data.get("note") ?? "").trim() || null, added_by: user.data.user?.id });
    if (error) setNotice(publicErrorMessage(error, "Ajout impossible.")); else { await client.rpc("sync_founder_badge", { target_provider_id: providerId }); setNotice("Prestataire ajouté à la cohorte lancement."); form.reset(); await load(); }
  }

  async function toggleFounder(row: CohortRow) {
    const client = getSupabaseBrowserClient(); if (!client) return;
    const { error } = await client.from("launch_provider_cohort").update({ is_founder: !row.is_founder, updated_at: new Date().toISOString() }).eq("provider_id", row.provider_id);
    if (!error) await client.rpc("sync_founder_badge", { target_provider_id: row.provider_id });
    setNotice(error ? "Le badge n’a pas été modifié." : "Statut fondateur mis à jour."); if (!error) await load();
  }

  async function createLaunchCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget; const values=new FormData(form); const client=getSupabaseBrowserClient(); if(!client)return;
    const startsAt=new Date(String(values.get("startsAt"))).toISOString(); const endsAt=new Date(String(values.get("endsAt"))).toISOString();
    const {error}=await client.from("promotions").insert({provider_id:String(values.get("providerId")),title:String(values.get("title")),description:String(values.get("description")??"")||null,discount_type:String(values.get("discountType")),discount_value:Number(values.get("discountValue")),starts_at:startsAt,ends_at:endsAt,is_active:false,campaign_kind:String(values.get("campaignKind")),auto_apply:false,launch_configuration:{created_from:"launch_dashboard",requires_explicit_activation:true}});
    setNotice(error?publicErrorMessage(error,"Le brouillon de campagne n’a pas été créé."):"Campagne créée en brouillon, sans remise automatique."); if(!error)form.reset();
  }

  if (loading) return <div className="admin-panel compact-empty">Chargement du pilotage lancement…</div>;

  if (mode === "platform-health") return <section className="admin-module launch-admin"><header><div><span>SURVEILLANCE LANCEMENT</span><h2>Santé de la plateforme</h2><p>Signaux opérationnels essentiels, sans données personnelles.</p></div><button onClick={() => void load()}>Actualiser</button></header>{notice && <p className="admin-feedback">{notice}</p>}<div className="health-grid">
    <article><span>Application</span><strong className={health.server ? "healthy" : "critical"}>{health.server ? "Opérationnelle" : "Incident"}</strong><small>Auth · Supabase · rôle serveur</small></article>
    <article><span>Réservations 24 h</span><strong>{health.bookings24h}</strong><small>Créations réelles</small></article><article><span>Uploads 24 h</span><strong>{health.uploads24h}</strong><small>Publications enregistrées</small></article>
    <article><span>Notifications 24 h</span><strong>{health.notifications24h}</strong><small>Internes</small></article><article><span>Alertes critiques</span><strong className={health.criticalAlerts ? "critical" : "healthy"}>{health.criticalAlerts}</strong><small>Anti-fraude ouvertes</small></article><article><span>Version Production</span><strong>{health.version}</strong><small>Commit validé</small></article>
  </div></section>;

  if (mode === "cohort") return <section className="admin-module launch-admin"><header><div><span>20 PROFESSIONNELS FONDATEURS</span><h2>Cohorte lancement</h2><p>Accompagnez les premiers professionnels sans exposer de données inutiles.</p></div></header>{notice && <p className="admin-feedback">{notice}</p>}<form className="launch-cohort-form" onSubmit={(event) => void addToCohort(event)}><select name="providerId" required defaultValue=""><option value="">Choisir un prestataire</option>{providers.filter((item) => !cohortIds.has(item.profile_id)).map((item) => <option key={item.profile_id} value={item.profile_id}>{item.business_name} · {item.status}</option>)}</select><input name="note" maxLength={2000} placeholder="Note interne de suivi"/><label><input name="founder" type="checkbox"/> Professionnel fondateur</label><button>Ajouter</button></form><div className="cohort-list">{cohort.map((row) => <article key={row.provider_id}><div><strong>{row.business_name}</strong><small>{row.status} · {row.verified_at ? "Vérifié" : "Vérification en attente"} · {row.completeness}%</small><small>{row.onboarding_status ?? "onboarding inconnu"} · {row.services_count} prestations · {row.published_content} contenus</small><small>Première réservation : {row.first_booking_at ? new Date(row.first_booking_at).toLocaleDateString("fr-FR") : "—"} · Dernière activité : {row.last_activity_at ? new Date(row.last_activity_at).toLocaleDateString("fr-FR") : "—"}</small>{row.internal_note && <p>{row.internal_note}</p>}</div><button onClick={() => void toggleFounder(row)}>{row.is_founder ? "★ Fondateur" : "Activer le badge"}</button></article>)}{cohort.length === 0 && <div className="compact-empty">Aucun professionnel dans la cohorte.</div>}</div></section>;

  return <section className="admin-module launch-admin"><header><div><span>PILOTAGE COMMERCIAL</span><h2>Lancement</h2><p>Objectifs 100 utilisateurs et 20 professionnels, calculés depuis Supabase.</p></div><button onClick={() => void load()}>Actualiser</button></header>{notice && <p className="admin-feedback">{notice}</p>}<div className="launch-goals"><ProgressGoal label="Utilisateurs" value={metrics.users} target={metrics.target_users}/><ProgressGoal label="Professionnels validés" value={metrics.providers_approved} target={metrics.target_providers}/></div><div className="launch-metrics">{[
    ["Clients actifs",metrics.active_clients],["Prestataires inscrits",metrics.providers],["Profils complets",metrics.complete_profiles],["Vidéos publiées",metrics.videos],["Réservations",metrics.bookings],["Conversion",`${metrics.booking_conversion}%`],["Abandons onboarding",metrics.onboarding_abandons],["Signalements",metrics.reports],["Alertes critiques",metrics.critical_alerts],["Rappels en attente",metrics.reminder_jobs_pending],
  ].map(([label,value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><div className="launch-rankings">{([['Catégories vues',metrics.top_categories],['Recherches',metrics.top_searches],['Villes',metrics.top_cities]] as Array<[string,RankedMetric[]]>).map(([title,items])=><article key={title}><h3>{title}</h3>{items.length?items.map((item)=><p key={item.label}><span>{item.label}</span><strong>{item.value}</strong></p>):<small>Pas encore de données.</small>}</article>)}</div><form className="launch-cohort-form" onSubmit={(event)=>void createLaunchCampaign(event)}><select name="campaignKind" required><option value="first_booking">Première réservation</option><option value="new_client">Nouveau client / cliente</option><option value="new_provider">Nouveaux prestataires</option><option value="category">Offre par catégorie</option><option value="local">Offre locale</option></select><select name="providerId" required defaultValue=""><option value="">Prestataire porteur</option>{providers.map((provider)=><option key={provider.profile_id} value={provider.profile_id}>{provider.business_name}</option>)}</select><input name="title" required minLength={2} maxLength={120} placeholder="Titre de campagne"/><input name="description" maxLength={1000} placeholder="Description"/><select name="discountType"><option value="percentage">Pourcentage</option><option value="fixed">Montant fixe</option></select><input name="discountValue" type="number" min="1" max="100" required placeholder="Valeur"/><input name="startsAt" type="datetime-local" required/><input name="endsAt" type="datetime-local" required/><button>Créer le brouillon</button><small>Aucune remise n’est activée ou appliquée automatiquement.</small></form></section>;
}
