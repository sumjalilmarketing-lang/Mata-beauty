import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PublicProfessionalProfile, type PublicProfessional } from "@/app/public-professional-profile";
import { publicProfessionalName } from "@/lib/domain/feed-presentation";

async function loadProfessional(username: string): Promise<PublicProfessional | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.from("provider_profiles").select("profile_id,slug,business_name,bio,city,area,cover_url,average_rating,review_count,verified_at,founder_badge_enabled").eq("status", "approved").eq("slug", username).maybeSingle();
  return error ? null : data as PublicProfessional | null;
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const item = await loadProfessional((await params).username);
  if (!item) return { title: "Professionnel introuvable" };
  const title = publicProfessionalName(item.business_name);
  const description = item.bio ?? (item.city ? `Prestations beauté à ${item.city}.` : "Découvrez les prestations de ce professionnel.");
  return { title, description, alternates: { canonical: `/professional/${encodeURIComponent(item.slug)}` }, openGraph: { title: `${title} · Mata Beauty`, description, type: "profile", images: [item.cover_url ?? "/og.png"] }, twitter: { card: "summary_large_image", title, description, images: [item.cover_url ?? "/og.png"] } };
}

export default async function ProfessionalPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ video?: string }> }) {
  const item = await loadProfessional((await params).username);
  if (!item) notFound();
  const video = (await searchParams).video;
  const initialPostId = typeof video === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(video) ? video : undefined;
  return <PublicProfessionalProfile providerId={item.profile_id} initialProfile={item} initialPostId={initialPostId} />;
}
