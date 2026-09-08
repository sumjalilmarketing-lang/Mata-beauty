"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
type Favorite = { provider_id: string; provider_profiles: { business_name: string; slug: string; city: string } | null };
export function ClientFavorites({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Favorite[]>([]);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let active = true; const client = getSupabaseBrowserClient(); if (!client) return;
    void client.from("favorites").select("provider_id,provider_profiles(business_name,slug,city)").eq("client_id", userId).then(({ data, error }) => { if (!active) return; setRows((data ?? []) as unknown as Favorite[]); setState(error ? "error" : "ready"); });
    return () => { active = false; };
  }, [userId]);
  return <section className="workspace-content"><article className="panel"><h2>Mes favoris</h2>{state === "loading" ? <p>Chargement…</p> : state === "error" ? <p role="alert">Vos favoris sont momentanément indisponibles.</p> : rows.length ? rows.map((row) => row.provider_profiles && <Link className="control-list-row" key={row.provider_id} href={`/professional/${row.provider_profiles.slug}`}><strong>{row.provider_profiles.business_name}</strong><span>{row.provider_profiles.city} · Voir le profil</span></Link>) : <p>Enregistrez un professionnel pour le retrouver ici.</p>}</article></section>;
}
