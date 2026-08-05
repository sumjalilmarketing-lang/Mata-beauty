import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type PublicProfessional = { profile_id: string; business_name: string; bio: string | null; city: string; cover_url: string | null; average_rating: number; review_count: number; provider_services: { id: string; title: string; duration_minutes: number; price_amount: number }[] };
async function loadProfessional(username: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const lookup = decodeURIComponent(username).replaceAll("-", " ");
  const { data } = await client.from("provider_profiles").select("profile_id,business_name,bio,city,cover_url,average_rating,review_count,provider_services(id,title,duration_minutes,price_amount)").eq("status", "approved").ilike("business_name", lookup).maybeSingle();
  return data as PublicProfessional | null;
}
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> { const item = await loadProfessional((await params).username); return item ? { title: item.business_name, description: item.bio ?? `Prestations beauté à ${item.city}.` } : { title: "Professionnel introuvable" }; }
export default async function ProfessionalPage({ params }: { params: Promise<{ username: string }> }) { const item = await loadProfessional((await params).username); if (!item) notFound(); return <main className="public-detail"><Link href="/discover">← Découvrir</Link><section>{item.cover_url && <Image src={item.cover_url} alt="" width={900} height={430} unoptimized />}<small>Professionnel vérifié · {item.city}</small><h1>{item.business_name}</h1><p>{item.bio ?? "Découvrez les prestations proposées sur Mata Beauty."}</p><strong>★ {Number(item.average_rating).toFixed(1)} · {item.review_count} avis</strong><div>{item.provider_services.map((service) => <Link href={`/service/${service.id}`} key={service.id}><span>{service.title}</span><small>{service.duration_minutes} min · {service.price_amount.toLocaleString("fr-FR")} FCFA</small></Link>)}</div></section></main>; }
