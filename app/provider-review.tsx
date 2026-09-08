"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProfessionalDocuments } from "./professional-documents";
type Profile = { business_name: string; bio: string | null; city: string; base_address: string | null };
type Business = { name: string; address: string; city: string };
export function ProviderReview({ providerId }: { providerId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [salons, setSalons] = useState<Business[]>([]);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let active = true; const client = getSupabaseBrowserClient(); if (!client) return;
    void Promise.all([client.from("provider_profiles").select("business_name,bio,city,base_address").eq("profile_id", providerId).single(), client.from("businesses").select("name,address,city").eq("owner_id", providerId)]).then(([p, b]) => { if (!active) return; setProfile(p.data); setSalons(b.data ?? []); setState(p.error || b.error ? "error" : "ready"); });
    return () => { active = false; };
  }, [providerId]);
  return <section aria-label="Dossier professionnel">{state === "loading" ? <p>Chargement du dossier…</p> : state === "error" ? <p role="alert">Dossier indisponible. Ne prenez pas de décision avant sa vérification.</p> : <><h2>{profile?.business_name}</h2><p>{profile?.bio || "Présentation non renseignée"}</p><p>{profile?.base_address || "Adresse à compléter"} · {profile?.city}</p>{salons.map((salon, index) => <p key={index}>Salon : {salon.name} · {salon.address} · {salon.city}</p>)}{!salons.length && <p>Aucun salon rattaché.</p>}<ProfessionalDocuments providerId={providerId} review /></>}</section>;
}
