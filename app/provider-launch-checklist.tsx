"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

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
    ["Compléter mon profil", checklist.photo && checklist.description, "/pro/public-profile"],
    ["Créer une prestation", checklist.services > 0, "/pro/services"],
    ["Définir mes tarifs", checklist.prices > 0, "/pro/services"],
    ["Configurer mes disponibilités", checklist.availability, "/pro/agenda"],
    ["Publier ma première réalisation", checklist.video, "/pro/videos"],
  ] as Array<[string, boolean, string]>, [checklist]);

  if (!available) return null;
  const completed = items.filter(([, complete]) => complete).length;
  const progressLabel = `${completed} / ${items.length}`;
  return <article className="panel launch-checklist">
    <div className="panel-heading"><div><span className="launch-kicker">PREMIERS PAS</span><h2>Configurer mon activité</h2><p>Complétez votre profil, puis préparez vos premières réservations.</p></div><strong>{progressLabel}</strong></div>
    <progress max={items.length} value={completed} aria-label={`${completed} étapes sur ${items.length}`} />
    <div className="launch-checklist-grid">{items.map(([label, complete, href]) => <Link className={complete ? "complete" : ""} href={href} key={label}><span>{complete ? "✓" : "○"}</span><p>{label}</p></Link>)}</div>
    <small>{checklist.verified ? "Profil vérifié par Mata Beauty." : "La validation de votre profil reste nécessaire avant sa publication."}</small>
  </article>;
}
