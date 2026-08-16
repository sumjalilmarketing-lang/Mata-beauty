import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { ProfileShareActions } from "../profile-share-actions";

type PublicProfessional = { profile_id: string; slug: string; business_name: string; bio: string | null; city: string; cover_url: string | null; average_rating: number; review_count: number; founder_badge_enabled?: boolean; provider_services: { id: string; title: string; duration_minutes: number; price_amount: number }[] };
async function loadProfessional(username: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const lookup = decodeURIComponent(username);
  const enriched = await client.from("provider_profiles").select("profile_id,slug,business_name,bio,city,cover_url,average_rating,review_count,founder_badge_enabled,provider_services(id,title,duration_minutes,price_amount)").eq("status", "approved").eq("slug", lookup).maybeSingle();
  if (!enriched.error) return enriched.data as PublicProfessional | null;
  const fallback = await client.from("provider_profiles").select("profile_id,slug,business_name,bio,city,cover_url,average_rating,review_count,provider_services(id,title,duration_minutes,price_amount)").eq("status", "approved").eq("slug", lookup).maybeSingle();
  return fallback.data as PublicProfessional | null;
}
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> { const item = await loadProfessional((await params).username); if (!item) return { title: "Professionnel introuvable" }; const description=item.bio ?? `Prestations beauté à ${item.city}.`; return { title:item.business_name,description,alternates:{canonical:`/professional/${item.slug}`},openGraph:{title:`${item.business_name} · Mata Beauty`,description,type:"profile",images:[item.cover_url ?? "/og.png"]},twitter:{card:"summary_large_image",title:item.business_name,description,images:[item.cover_url ?? "/og.png"]} }; }
export default async function ProfessionalPage({ params }: { params: Promise<{ username: string }> }) { const item = await loadProfessional((await params).username); if (!item) notFound(); const base=process.env.NEXT_PUBLIC_APP_URL ?? "https://mata-beauty.vercel.app"; const profileUrl=new URL(`/professional/${item.slug}`,base).toString(); return <main className="public-detail"><Link href="/discover">← Découvrir</Link><section>{item.cover_url && <Image src={item.cover_url} alt="" width={900} height={430} unoptimized />}<small>Professionnel vérifié · {item.city}</small>{item.founder_badge_enabled && <b className="founder-badge">★ Professionnel fondateur</b>}<h1>{item.business_name}</h1><p>{item.bio ?? "Découvrez les prestations proposées sur Mata Beauty."}</p><strong>★ {Number(item.average_rating).toFixed(1)} · {item.review_count} avis vérifiés</strong><div>{item.provider_services.map((service) => <Link href={`/service/${service.id}`} key={service.id}><span>{service.title}</span><small>{service.duration_minutes} min · {service.price_amount.toLocaleString("fr-FR")} FCFA</small></Link>)}</div><ProfileShareActions profileUrl={profileUrl} businessName={item.business_name}/></section></main>; }
