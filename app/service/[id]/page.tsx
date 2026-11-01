import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type PublicService = { id: string; title: string; description: string | null; duration_minutes: number; price_amount: number; currency: string | null; provider_profiles: { profile_id: string; slug: string; business_name: string; city: string | null; status: string } | null; businesses: { area: string | null; city: string | null; status: string; is_active: boolean; archived_at: string | null } | null };
async function loadService(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await client.from("provider_services")
    .select("id,title,description,duration_minutes,price_amount,currency,provider_profiles!inner(profile_id,slug,business_name,city,status),businesses(area,city,status,is_active,archived_at)")
    .eq("id", id).eq("is_active", true).is("archived_at", null).eq("provider_profiles.status", "approved").maybeSingle();
  return error || !data ? null : data as unknown as PublicService;
}
function jsonLd(value: Record<string, unknown>) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const item = await loadService((await params).id);
  if (!item) return { title: "Prestation introuvable", robots: { index: false, follow: false } };
  const publicBusiness = item.businesses?.status === "approved" && item.businesses.is_active && !item.businesses.archived_at ? item.businesses : null;
  const city = publicBusiness?.city || item.provider_profiles?.city;
  const area = publicBusiness?.area;
  const description = item.description?.trim().slice(0, 155) || `Consultez ${item.title}${area ? ` à ${area}` : ""}${city ? `, ${city}` : ""} et ses disponibilités sur MATA Beauty.`.slice(0, 155);
  const canonical = `/service/${encodeURIComponent(item.id)}`;
  return {
    title: `${item.title}${city ? ` à ${city}` : ""}`,
    description,
    alternates: { canonical },
    openGraph: { title: `${item.title} · MATA Beauty`, description, type: "website", url: canonical, images: [{ url: "/og.png", alt: "MATA Beauty — prestations beauté au Sénégal" }] },
    twitter: { card: "summary_large_image", title: item.title, description, images: ["/og.png"] },
  };
}
export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const item = await loadService((await params).id);
  if (!item) notFound();
  const provider = item.provider_profiles;
  const publicBusiness = item.businesses?.status === "approved" && item.businesses.is_active && !item.businesses.archived_at ? item.businesses : null;
  const city = publicBusiness?.city || provider?.city;
  const area = publicBusiness?.area;
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org", "@type": "Service", name: item.title,
    ...(item.description ? { description: item.description } : {}),
    ...(provider ? { provider: { "@type": "ProfessionalService", name: provider.business_name, url: `https://mata-beauty.com/professional/${encodeURIComponent(provider.slug)}` } } : {}),
    ...(area || city ? { areaServed: [
      ...(area ? [{ "@type": "Place", name: [area, city].filter(Boolean).join(", ") }] : []),
      ...(city ? [{ "@type": "City", name: city }] : []),
    ] } : {}),
    ...(item.currency && /^[A-Z]{3}$/.test(item.currency) ? { offers: { "@type": "Offer", price: item.price_amount, priceCurrency: item.currency } } : {}),
  };
  return <main className="public-detail">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
    <Link href="/">← Découvrir sur MATA Beauty</Link>
    <section>
      {(area || city) && <small>{[area, city].filter(Boolean).join(", ")}</small>}
      <h1>{item.title}</h1>
      {provider && <h2><Link href={`/professional/${encodeURIComponent(provider.slug)}`}>{provider.business_name}</Link></h2>}
      {item.description && <p>{item.description}</p>}
      <strong>{item.duration_minutes} min · {item.price_amount.toLocaleString("fr-FR")} {item.currency ?? ""}</strong>
      <Link className="public-primary" href={`/?service=${encodeURIComponent(item.id)}`}>Choisir un créneau</Link>
    </section>
  </main>;
}
