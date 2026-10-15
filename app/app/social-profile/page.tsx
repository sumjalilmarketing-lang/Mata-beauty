import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicSocialProfile } from "@/app/public-social-profile";
import { loadOwnClientSocialProfile } from "@/lib/profiles/public-social-profile";
import { createSupabasePageClient } from "@/lib/supabase/server";
import styles from "./social-profile-status.module.css";

export const dynamic = "force-dynamic";

const statusCopy = {
  profile_missing: {
    title: "Votre profil Client n’est pas encore disponible",
    description: "Votre compte n’est pas encore relié à un profil Client. Vos informations restent privées. Vous pouvez revenir à votre espace ou réessayer.",
  },
  not_client: {
    title: "Ce compte n’a pas de profil Client",
    description: "Connectez-vous avec votre compte Client pour afficher votre profil social. Vos données restent privées.",
  },
  suspended: {
    title: "Votre profil est temporairement indisponible",
    description: "L’accès à ce profil est suspendu. Contactez l’assistance si vous pensez qu’il s’agit d’une erreur.",
  },
  load_failed: {
    title: "Le profil n’a pas pu être chargé",
    description: "Une erreur temporaire empêche le chargement de vos informations. Réessayez dans un instant.",
  },
  profile_unavailable: {
    title: "Votre profil social est momentanément indisponible",
    description: "Certaines informations du profil n’ont pas pu être chargées. Réessayez ou revenez à votre espace personnel.",
  },
} as const;

export default async function OwnClientSocialProfilePage() {
  const auth = await createSupabasePageClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) {
    redirect("/?connexion=requise&returnTo=%2Fapp%2Fsocial-profile");
  }

  const result = await loadOwnClientSocialProfile(data.user.id);
  if (result.status !== "ready") {
    const copy = statusCopy[result.status];
    return (
      <main className={styles.page} aria-labelledby="client-social-profile-status">
        <header className={styles.header}>
          <Link className={styles.brand} href="/app/profile" aria-label="MATA Beauty, revenir à mon espace">
            <span className={styles.brandMark}>M</span>
            <span>MATA <i>BEAUTY</i></span>
          </Link>
          <span className={styles.privateLabel}>Espace personnel sécurisé</span>
        </header>
        <section className={styles.card} role="status">
          <span className={styles.icon} aria-hidden="true">♡</span>
          <p className={styles.eyebrow}>PROFIL SOCIAL</p>
          <h1 id="client-social-profile-status">{copy.title}</h1>
          <p className={styles.description}>{copy.description}</p>
          <nav className={styles.actions} aria-label="Navigation de votre espace client">
            <Link className={styles.primaryAction} href="/app/profile">Mon profil</Link>
            <Link className={styles.secondaryAction} href="/app/bookings">Mes réservations</Link>
            <Link className={styles.secondaryAction} href="/app/messages">Mes messages</Link>
            <Link className={styles.retryAction} href="/app/social-profile">Réessayer</Link>
          </nav>
        </section>
        <footer className={styles.footer}>Vos réservations et conversations restent accessibles uniquement depuis votre compte.</footer>
      </main>
    );
  }

  return <PublicSocialProfile profile={result.profile} />;
}
