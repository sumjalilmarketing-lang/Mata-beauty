"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProfessionalDocuments } from "./professional-documents";
import { applicationStatusLabels } from "./client-profile";

type Dossier = {
  business_name: string; bio: string | null; city: string; base_address: string | null;
  years_experience: number; languages: string[]; cancellation_policy: string | null;
  first_name: string | null; last_name: string | null; display_name: string | null;
  email: string | null; phone: string | null; avatar_url: string | null;
  status: string; submitted_at: string | null;
};
type Event = { happened_at: string; label: string; actor: string | null; detail: string | null };
type Business = { name: string; address: string; city: string };
const date = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(value));

export function ProviderReview({ providerId, refreshStatus, onReady, onChange }: { providerId: string; refreshStatus?: string; onReady?: (ready: boolean) => void; onChange?: () => void }) {
  const [profile, setProfile] = useState<Dossier | null>(null);
  const [salons, setSalons] = useState<Business[]>([]);
  const [history, setHistory] = useState<Event[]>([]);
  const [state, setState] = useState("loading");
  const [revision, setRevision] = useState(0);
  const [documentsReady, setDocumentsReady] = useState(false);
  useEffect(() => { onReady?.(state === "ready" && documentsReady); }, [state, documentsReady, onReady]);
  useEffect(() => {
    let active = true; const client = getSupabaseBrowserClient();
    if (!client) { queueMicrotask(() => { if (active) setState("error"); }); return () => { active = false; }; }
    void Promise.all([
      client.rpc("professional_application_detail", { target_provider_id: providerId }),
      client.from("businesses").select("name,address,city").eq("owner_id", providerId),
      client.rpc("professional_application_history", { target_provider_id: providerId }),
    ]).then(([p, b, events]) => {
      if (!active) return;
      setProfile((p.data?.[0] ?? null) as Dossier | null); setSalons(b.data ?? []);
      setHistory((events.data ?? []) as Event[]); setState(p.error || !p.data?.length || b.error || events.error ? "error" : "ready");
    });
    return () => { active = false; };
  }, [providerId, revision, refreshStatus]);
  return <section className="professional-dossier" aria-label="Dossier professionnel">
    {state === "loading" ? <p role="status">Chargement du dossier…</p> : state === "error" ? <div role="alert"><p>Dossier indisponible. Ne prenez pas de décision avant sa vérification.</p><button onClick={() => setRevision(value => value + 1)}>Réessayer</button></div> : profile && <>
      <header className="dossier-heading"><div><p>Candidature professionnelle</p><h2>{profile.business_name}</h2></div><span className="dossier-status">{applicationStatusLabels[profile.status] ?? "À vérifier"}</span></header>
      <div className="dossier-grid">
        <section className="dossier-section"><h3>Identité du candidat</h3>
          {profile.avatar_url && <Image src={profile.avatar_url} alt="Photo du candidat" width={72} height={72} unoptimized className="dossier-avatar" />}
          <dl><dt>Nom et prénom</dt><dd>{[profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "À compléter"}</dd>
            <dt>E-mail</dt><dd>{profile.email || "Non renseigné"}</dd><dt>Téléphone</dt><dd>{profile.phone || "Non renseigné"}</dd>
            <dt>Date de demande</dt><dd>{profile.submitted_at ? date(profile.submitted_at) : "Dossier non envoyé"}</dd></dl>
        </section>
        <section className="dossier-section"><h3>Activité professionnelle</h3><dl>
          <dt>Présentation et spécialité</dt><dd>{profile.bio || "Non renseignée"}</dd>
          <dt>Localisation</dt><dd>{profile.base_address || "Adresse à compléter"} · {profile.city}</dd>
          <dt>Expérience</dt><dd>{profile.years_experience} an(s)</dd><dt>Langues</dt><dd>{profile.languages?.join(", ") || "Non renseignées"}</dd>
          <dt>Salon rattaché</dt><dd>{salons.length ? salons.map(salon => `${salon.name} · ${salon.address} · ${salon.city}`).join(" ; ") : "Aucun salon rattaché"}</dd>
          <dt>Conditions d’annulation</dt><dd>{profile.cancellation_policy || "Non renseignées"}</dd>
        </dl></section>
      </div>
      <ProfessionalDocuments providerId={providerId} review readOnly={!["submitted", "under_review", "additional_information_required"].includes(profile.status)} onReady={setDocumentsReady} onChange={() => { setRevision(value => value + 1); onChange?.(); }} />
      <section className="dossier-section"><h3>Historique du dossier</h3><p>Dates et heures de Dakar.</p>{history.length ? <ol className="dossier-history">{history.map((event, index) => <li key={`${event.happened_at}-${index}`}><time>{date(event.happened_at)}</time><div><strong>{event.label}</strong>{event.detail && <p>{event.detail}</p>}{event.actor && <small>{event.actor}</small>}</div></li>)}</ol> : <p>Aucun événement enregistré pour ce dossier.</p>}</section>
    </>}
  </section>;
}
