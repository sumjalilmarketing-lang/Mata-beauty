"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
type Favorite = { provider_id: string; provider_profiles: { business_name: string; slug: string; city: string } | null };
export function ClientFavorites({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Favorite[]>([]);
  const [state, setState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const client = getSupabaseBrowserClient();
    async function load() {
      try {
        if(!client) throw new Error("Session indisponible");
        const result = await client.from("favorites").select("provider_id,provider_profiles(business_name,slug,city)").eq("client_id",userId).abortSignal(AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]));
        if(result.error) throw result.error;
        if(active) { setRows((result.data??[]) as unknown as Favorite[]); setState("ready"); }
      } catch { if(active) setState("error"); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [userId, attempt]);
  return <section className="workspace-content"><article className="panel"><h2>Mes favoris</h2>{state === "loading" ? <p>Chargement…</p> : state === "error" ? <div role="alert"><p>Vos favoris sont momentanément indisponibles.</p><button type="button" onClick={()=>{setState("loading");setAttempt(value=>value+1);}}>Réessayer</button></div> : rows.length ? rows.map((row) => row.provider_profiles && <Link className="control-list-row" key={row.provider_id} href={`/professional/${row.provider_profiles.slug}`}><strong>{row.provider_profiles.business_name}</strong><span>{row.provider_profiles.city} · Voir le profil</span></Link>) : <p>Enregistrez un professionnel pour le retrouver ici.</p>}</article></section>;
}
