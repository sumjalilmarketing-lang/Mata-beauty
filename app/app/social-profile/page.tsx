import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicSocialProfile } from "@/app/public-social-profile";
import { loadOwnClientSocialProfile } from "@/lib/profiles/public-social-profile";
import { createSupabasePageClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OwnClientSocialProfilePage() {
  const auth = await createSupabasePageClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) {
    redirect("/?connexion=requise&returnTo=%2Fapp%2Fsocial-profile");
  }

  const profile = await loadOwnClientSocialProfile(data.user.id);
  if (!profile) {
    return (
      <main className="workspace-content" aria-labelledby="client-social-profile-unavailable">
        <section className="panel">
          <h1 id="client-social-profile-unavailable">Votre profil social est momentanément indisponible</h1>
          <p>Vos informations restent privées. Réessayez ou revenez à votre espace personnel.</p>
          <Link href="/app/profile">Retour à mon profil</Link>
        </section>
      </main>
    );
  }

  return <PublicSocialProfile profile={profile} />;
}
