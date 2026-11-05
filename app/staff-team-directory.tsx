"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
type Colleague = { business_id: string; collaborator_id: string; display_name: string; title: string | null };
export function StaffTeamDirectory() {
  const [rows, setRows] = useState<Colleague[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      const api = getSupabaseBrowserClient();
      if (!api) throw Error("unavailable");
      const result = await api.rpc("get_my_team_directory").abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]));
      if (result.error) throw result.error;
      if (active) { setRows((result.data ?? []) as Colleague[]); setError(false); }
    }
    void load().catch(() => { if (active) { setRows([]); setError(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [attempt]);
  return <details><summary>Mon équipe</summary>
    {loading && <p role="status">Chargement de l’équipe…</p>}
    {error && <><p role="alert">Équipe indisponible.</p><button type="button" onClick={() => { setError(false); setLoading(true); setAttempt(value => value + 1); }}>Réessayer</button></>}
    {!loading && !error && (rows.length ? <ul>{rows.map(person => <li key={person.collaborator_id}>{person.display_name}{person.title ? ` · ${person.title}` : ""}</li>)}</ul> : <p>Aucun membre d’équipe disponible.</p>)}
    <p>Les plannings personnels de vos collègues restent privés.</p>
  </details>;
}
