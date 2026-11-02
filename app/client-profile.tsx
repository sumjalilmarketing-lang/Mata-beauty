"use client";
import { workspaceText } from "@/lib/domain/workspace-copy";
import { useApplicationLocale } from "./use-application-locale";

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
  const locale = useApplicationLocale();
  const t = (text: string) => workspaceText(text, locale);
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
  if (error) return <section className="panel"><p role="alert">{t("Votre profil est momentanément indisponible.")}</p><button onClick={() => void load()}>{t("Réessayer")}</button></section>;
  if (!profile) return <p role="status">{t("Chargement de votre profil…")}</p>;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "Mon profil";
  const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join("");
  return <section className="client-control-center personal-profile" aria-label={t("Mon profil client")}>
    <article className="panel client-profile-hero">
      <div className="client-avatar">{profile.avatar_url ? <Image src={profile.avatar_url} alt={t("Photo de profil")} width={88} height={88} unoptimized /> : <span aria-label={t("Initiales du profil")}>{initials}</span>}</div>
      <div><small>{t("MON ESPACE PERSONNEL")}</small><h2>{name}</h2>{profile.bio && <p>{profile.bio}</p>}</div>
      <Link href="/app/settings#edit-client-profile">{t("Modifier mon profil")}</Link>
      <Link href="/app/social-profile">{t("Profil social")}</Link>
      <div className="client-profile-counts"><b>{counts.bookings}<small>{t("Rendez-vous")}</small></b><b>{counts.saves}<small>{t("Enregistrés")}</small></b></div>
    </article>
    <nav className="profile-shortcuts" aria-label={t("Mon activité")}>
      <Link href="/app/bookings">{t("Mes rendez-vous et historique")}</Link>
      <Link href="/app/favorites">{t("Mes favoris")}</Link>
      <Link href="/app/inspirations">{t("Mes vidéos enregistrées")}</Link>
      <Link href="/app/settings#edit-client-profile">{t("Mes informations")}</Link>
    </nav>
    <article className="panel"><h2>{status ? t("Ma candidature professionnelle") : t("Vous êtes professionnel de la beauté ?")}</h2>
      {status && <p role="status">{t(applicationStatusLabels[status] ?? "Votre dossier est en cours de traitement")}</p>}
      <Link className="primary-button" href={status === "verified" ? "/pro" : "/app/application"}>{status === "verified" ? t("Ouvrir mon espace professionnel") : status ? t("Consulter mon dossier") : t("Devenir professionnel")}</Link>
    </article>
    <Link className="panel profile-settings-link" href="/app/settings">{t("Paramètres et confidentialité →")}</Link>
  </section>;
}
