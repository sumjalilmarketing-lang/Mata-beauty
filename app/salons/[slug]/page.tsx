import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSocialProfile } from "@/app/public-social-profile";
import { createSupabasePageClient } from "@/lib/supabase/server";
import { loadPublicSocialProfile } from "@/lib/profiles/public-social-profile";
import { publicMetadataImage } from "@/lib/public-image";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadPublicSocialProfile("salon", slug, null);
  if (!profile) return { title: "Salon introuvable", robots: { index: false, follow: false } };
  const description = profile.bio?.trim().slice(0, 155) || ["Prestations et réalisations de", profile.name, profile.area, profile.city].filter(Boolean).join(" · ");
  const canonical = `/salons/${encodeURIComponent(profile.slug)}`;
  const image = publicMetadataImage(profile.coverUrl || profile.avatarUrl);
  return {
    title: `${profile.name} · Salon beauté${profile.city ? ` à ${profile.city}` : ""}`,
    description,
    alternates: { canonical },
    openGraph: { title: `${profile.name} · MATA Beauty`, description, type: "profile", url: canonical, images: [{ url: image, alt: `Profil de ${profile.name}` }] },
    twitter: { card: "summary_large_image", title: profile.name, description, images: [image] },
  };
}

export default async function SalonSocialProfilePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ video?: string }> }) {
  const { slug } = await params;
  const auth = await createSupabasePageClient();
  const { data } = await auth.auth.getUser();
  const profile = await loadPublicSocialProfile("salon", slug, data.user?.id ?? null);
  if (!profile) notFound();
  return <PublicSocialProfile profile={profile} initialVideoId={(await searchParams)?.video ?? null} />;
}
