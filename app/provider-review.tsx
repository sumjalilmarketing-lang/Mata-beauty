"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProfessionalDocuments } from "./professional-documents";
type Profile = { business_name: string; bio: string | null; city: string; base_address: string | null; years_experience: number; languages: string[]; cancellation_policy: string | null };
type Identity = { first_name: string | null; last_name: string | null; display_name: string | null };
type Business = { name: string; address: string; city: string };
export function ProviderReview({ providerId, onReady }: { providerId: string; onReady?: (ready: boolean) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [salons, setSalons] = useState<Business[]>([]);
  const [state, setState] = useState("loading");
  const [documentsReady, setDocumentsReady] = useState(false);
  useEffect(() => { onReady?.(state === "ready" && documentsReady); }, [state, documentsReady, onReady]);
  useEffect(() => {
    let active = true; const client = getSupabaseBrowserClient();
    if (!client) { queueMicrotask(() => { if (active) setState("error"); }); return () => { active = false; }; }
    void Promise.all([client.from("provider_profiles").select("business_name,bio,city,base_address,years_experience,languages,cancellation_policy").eq("profile_id", providerId).single(), client.from("businesses").select("name,address,city").eq("owner_id", providerId), client.from("profiles").select("first_name,last_name,display_name").eq("id", providerId).single()]).then(([p, b, person]) => { if (!active) return; setProfile(p.data); setIdentity(person.data); setSalons(b.data ?? []); setState(p.error || b.error || person.error ? "error" : "ready"); });
    return () => { active = false; };
  }, [providerId]);
  return <section aria-label="Dossier professionnel">{state === "loading" ? <p>Chargement du dossier…</p> : state === "error" ? <p role="alert">Dossier indisponible. Ne prenez pas de décision avant sa vérification.</p> : <><h2>{profile?.business_name}</h2><p>Candidat : {[identity?.first_name, identity?.last_name].filter(Boolean).join(" ") || identity?.display_name || "Identité à compléter"}</p><p>{profile?.bio || "Présentation non renseignée"}</p><p>{profile?.base_address || "Adresse à compléter"} · {profile?.city}</p><p>Expérience : {profile?.years_experience ?? 0} an(s)</p><p>Langues : {profile?.languages?.join(", ") || "Non renseignées"}</p><p>Conditions d’annulation : {profile?.cancellation_policy || "Non renseignées"}</p>{salons.map((salon, index) => <p key={index}>Salon : {salon.name} · {salon.address} · {salon.city}</p>)}{!salons.length && <p>Aucun salon rattaché.</p>}<ProfessionalDocuments providerId={providerId} review onReady={setDocumentsReady} /></>}</section>;
}
