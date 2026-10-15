"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Profile = { first_name: string | null; last_name: string | null; display_name: string | null; avatar_url: string | null; bio: string | null; username: string | null };
export const applicationStatusLabels: Record<string, string> = {
  draft: "Votre dossier est en brouillon", profile_incomplete: "Complétez votre dossier",
  submitted: "Votre dossier a été envoyé", under_review: "Votre dossier est en cours d’examen",
  additional_information_required: "Un complément est demandé", verified: "Votre compte professionnel est approuvé",
  rejected: "Votre dossier a été refusé", suspended: "Votre activité est suspendue", disabled: "Votre activité est désactivée",
};

export function ClientProfile({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [counts, setCounts] = useState({ bookings: 0, saves: 0 });
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) { setError(true); return; }
    setError(false);
    const [identity, application, bookings, saves] = await Promise.all([
      client.from("profiles").select("first_name,last_name,display_name,avatar_url,bio,username").eq("id", userId).single(),
      client.from("professional_onboarding").select("status").eq("provider_id", userId).maybeSingle(),
      client.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", userId),
      client.from("post_saves").select("post_id", { count: "exact", head: true }).eq("profile_id", userId),
    ]);
    if (identity.error || application.error || bookings.error || saves.error) { setError(true); return; }
    setProfile(identity.data); setStatus(application.data?.status ?? null);
    setCounts({ bookings: bookings.count ?? 0, saves: saves.count ?? 0 });
  }, [userId]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  if (error) return <section className="panel"><p role="alert">Votre profil est momentanément indisponible.</p><button onClick={() => void load()}>Réessayer</button></section>;
  if (!profile) return <p role="status">Chargement de votre profil…</p>;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "Mon profil";
  const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join("");
  return <section className="client-control-center personal-profile" aria-label="Mon profil client">
    <article className="panel client-profile-hero">
      <div className="client-avatar">{profile.avatar_url ? <Image src={profile.avatar_url} alt="Photo de profil" width={88} height={88} unoptimized /> : <span aria-label="Initiales du profil">{initials}</span>}</div>
      <div><small>MON ESPACE PERSONNEL</small><h2>{name}</h2>{profile.bio && <p>{profile.bio}</p>}</div>
      <Link href="/app/settings#edit-client-profile">Modifier mon profil</Link>
      {profile.username && <Link href={"/u/" + encodeURIComponent(profile.username)}>Voir mon profil social</Link>}
      <div className="client-profile-counts"><b>{counts.bookings}<small>Rendez-vous</small></b><b>{counts.saves}<small>Enregistrés</small></b></div>
    </article>
    <nav className="profile-shortcuts" aria-label="Mon activité">
      <Link href="/app/bookings">Mes rendez-vous et historique</Link>
      <Link href="/app/favorites">Mes favoris</Link>
      <Link href="/app/inspirations">Mes vidéos enregistrées</Link>
      <Link href="/app/settings#edit-client-profile">Mes informations</Link>
    </nav>
    <article className="panel"><h2>{status ? "Ma candidature professionnelle" : "Vous êtes professionnel de la beauté ?"}</h2>
      {status && <p role="status">{applicationStatusLabels[status] ?? "Votre dossier est en cours de traitement"}</p>}
      <Link className="primary-button" href={status === "verified" ? "/pro" : "/app/application"}>{status === "verified" ? "Ouvrir mon espace professionnel" : status ? "Consulter mon dossier" : "Devenir professionnel"}</Link>
    </article>
    <Link className="panel profile-settings-link" href="/app/settings">Paramètres et confidentialité →</Link>
  </section>;
}

