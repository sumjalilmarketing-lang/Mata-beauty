import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicSocialProfile } from "@/app/public-social-profile";
import { loadOwnClientSocialProfile } from "@/lib/profiles/public-social-profile";
import { createSupabasePageClient } from "@/lib/supabase/server";
import styles from "../social-profile/social-profile-status.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const statusCopy = {
  profile_missing: { title: "Votre profil n’est pas encore disponible", description: "Votre compte n’est pas encore relié à un profil Client. Réessayez ou contactez l’assistance." },
  not_client: { title: "Votre espace professionnel", description: "Ce compte n’a pas de profil Client. Retrouvez votre activité professionnelle depuis votre espace dédié." },
  suspended: { title: "Votre profil est temporairement indisponible", description: "Contactez l’assistance si vous pensez qu’il s’agit d’une erreur." },
  load_failed: { title: "Le profil n’a pas pu être chargé", description: "Une erreur temporaire empêche le chargement. Réessayez dans un instant." },
  profile_unavailable: { title: "Votre profil est momentanément indisponible", description: "Certaines informations du profil n’ont pas pu être chargées. Réessayez." },
} as const;

export default async function UnifiedProfilePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const auth = await createSupabasePageClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) redirect("/?connexion=requise&returnTo=%2Fapp%2Fprofile");
  const result = await loadOwnClientSocialProfile(data.user.id);
  if (result.status !== "ready") {
    const copy = statusCopy[result.status];
    return <main className={styles.page} aria-labelledby="profile-status-title">
      <header className={styles.header}><Link className={styles.brand} href="/" aria-label="MATA Beauty, accueil"><span className={styles.brandMark}>M</span><span>MATA <i>BEAUTY</i></span></Link><span className={styles.privateLabel}>Espace personnel sécurisé</span></header>
      <section className={styles.card} role="status"><span className={styles.icon} aria-hidden="true">♡</span><p className={styles.eyebrow}>MON PROFIL</p><h1 id="profile-status-title">{copy.title}</h1><p className={styles.description}>{copy.description}</p>
        <nav className={styles.actions} aria-label="Navigation du compte">
          {result.status === "not_client" ? <Link className={styles.primaryAction} href="/pro">Espace professionnel</Link> : <Link className={styles.primaryAction} href="/app/profile">Réessayer</Link>}
          <Link className={styles.secondaryAction} href="/app/bookings">Mes rendez-vous</Link><Link className={styles.secondaryAction} href="/app/messages">Mes messages</Link>
        </nav>
      </section><footer className={styles.footer}>Vos réservations et conversations restent privées et accessibles uniquement depuis votre compte.</footer>
    </main>;
  }
  const params = await searchParams;
  const editMode = (Array.isArray(params?.edit) ? params.edit[0] : params?.edit) === "1";
  return <PublicSocialProfile profile={result.profile} initialEditMode={editMode} />;
}
