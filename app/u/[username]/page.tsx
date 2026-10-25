import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSocialProfile } from "@/app/public-social-profile";
import { loadPublicSocialProfile } from "@/lib/profiles/public-social-profile";
import { createSupabasePageClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} · MATA Beauty`, description: "Profil client MATA Beauty", robots: { index: false, follow: true, noarchive: true } };
}

export default async function ClientSocialProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams?: Promise<{ video?: string }> }) {
  const { username } = await params;
  const auth = await createSupabasePageClient();
  const { data } = await auth.auth.getUser();
  const profile = await loadPublicSocialProfile("client", username, data.user?.id ?? null);
  if (!profile) notFound();
  return <PublicSocialProfile profile={profile} initialVideoId={(await searchParams)?.video ?? null} />;
}
