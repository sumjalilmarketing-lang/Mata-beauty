import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSocialProfile } from "@/app/public-social-profile";
import { loadPublicSocialProfile } from "@/lib/profiles/public-social-profile";
import { createSupabasePageClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} · Salon MATA Beauty`, description: "Découvrez ce salon, ses réalisations et ses prestations sur MATA Beauty." };
}

export default async function SalonSocialProfilePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ video?: string }> }) {
  const { slug } = await params;
  const auth = await createSupabasePageClient();
  const { data } = await auth.auth.getUser();
  const profile = await loadPublicSocialProfile("salon", slug, data.user?.id ?? null);
  if (!profile) notFound();
  return <PublicSocialProfile profile={profile} initialVideoId={(await searchParams)?.video ?? null} />;
}

