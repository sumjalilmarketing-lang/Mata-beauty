"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Checklist = {
  score: number; photo: boolean; description: boolean; services: number; prices: number;
  availability: boolean; portfolio: number; video: boolean; verified: boolean; ready: boolean;
};

const emptyChecklist: Checklist = { score: 0, photo: false, description: false, services: 0, prices: 0, availability: false, portfolio: 0, video: false, verified: false, ready: false };

export function ProviderLaunchChecklist({ userId }: { userId: string }) {
  const [checklist, setChecklist] = useState<Checklist>(emptyChecklist);
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data, error } = await client.rpc("get_provider_launch_checklist", { target_provider_id: userId });
    if (error) { setAvailable(false); return; }
    setChecklist(data as Checklist); setAvailable(true);
  }, [userId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const items = useMemo(() => [
    ["Ajouter une photo", checklist.photo], ["Compléter la description", checklist.description],
    ["Ajouter 3 prestations", checklist.services >= 3], ["Ajouter les tarifs", checklist.prices >= 3],
    ["Configurer les disponibilités", checklist.availability], ["Ajouter 3 photos portfolio", checklist.portfolio >= 3],
    ["Publier une première vidéo", checklist.video], ["Vérifier son identité", checklist.verified],
  ] as Array<[string, boolean]>, [checklist]);

  if (!available) return null;
  const progressLabel = checklist.ready ? "Profil prêt" : `${Math.max(0, Math.min(100, checklist.score))} %`;
  return <article className="panel launch-checklist">
    <div className="panel-heading"><div><span className="launch-kicker">LANCEMENT</span><h2>Votre profil en moins de 10 minutes</h2><p>Complétez les étapes essentielles pour être trouvé et réservé.</p></div><strong>{progressLabel}</strong></div>
    <progress max="100" value={checklist.score} aria-label={`Complétude ${checklist.score} sur 100`} />
    <div className="launch-checklist-grid">{items.map(([label, complete]) => <div className={complete ? "complete" : ""} key={label}><span>{complete ? "✓" : "○"}</span><p>{label}</p></div>)}</div>
    {!checklist.ready && <small>Il vous manque {items.filter(([, complete]) => !complete).length} étape(s) pour un profil prêt au lancement.</small>}
  </article>;
}
