import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PublicSocialProfile } from "@/app/public-social-profile";
import { loadPublicSocialProfile } from "@/lib/profiles/public-social-profile";
import { createSupabasePageClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicProfessional = { profile_id: string; slug: string; business_name: string; bio: string | null; city: string; cover_url: string | null; average_rating: number; review_count: number; founder_badge_enabled?: boolean; provider_services: { id: string; title: string; duration_minutes: number; price_amount: number }[] };
async function loadProfessional(username: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const lookup = decodeURIComponent(username);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lookup);
  let enrichedQuery = client.from("provider_profiles").select("profile_id,slug,business_name,bio,city,cover_url,average_rating,review_count,founder_badge_enabled,provider_services(id,title,duration_minutes,price_amount)").eq("status", "approved");
  enrichedQuery = isUuid ? enrichedQuery.eq("profile_id", lookup) : enrichedQuery.eq("slug", lookup);
  const enriched = await enrichedQuery.maybeSingle();
  if (!enriched.error) return enriched.data as PublicProfessional | null;
  const fallback = await client.from("provider_profiles").select("profile_id,slug,business_name,bio,city,cover_url,average_rating,review_count,provider_services(id,title,duration_minutes,price_amount)").eq("status", "approved").eq("slug", lookup).maybeSingle();
  return fallback.data as PublicProfessional | null;
}
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> { const item = await loadProfessional((await params).username); if (!item) return { title: "Professionnel introuvable" }; const description=item.bio ?? `Prestations beauté à ${item.city}.`; return { title:item.business_name,description,alternates:{canonical:`/professional/${item.slug}`},openGraph:{title:`${item.business_name} · Mata Beauty`,description,type:"profile",images:[item.cover_url ?? "/og.png"]},twitter:{card:"summary_large_image",title:item.business_name,description,images:[item.cover_url ?? "/og.png"]} }; }
export default async function ProfessionalPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams?: Promise<{ video?: string }> }) {
  const { username } = await params;
  const auth = await createSupabasePageClient();
  const { data } = await auth.auth.getUser();
  const profile = await loadPublicSocialProfile("professional", username, data.user?.id ?? null);
  if (!profile) notFound();
  return <PublicSocialProfile profile={profile} initialVideoId={(await searchParams)?.video ?? null} />;
}

