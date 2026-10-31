import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type PublicProvider = { slug: string; business_name: string; city: string | null };
type PublicService = { id: string; title: string; provider_profiles: { slug: string; business_name: string; status: string } | null };
type PublicCategory = { id: string; name: string; slug: string };

async function loadDirectory() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { categories: [] as PublicCategory[], providers: [] as PublicProvider[], services: [] as PublicService[] };

  try {
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const [categoryResult, providerResult, serviceResult] = await Promise.allSettled([
      client.from("categories").select("id,name,slug").eq("is_active", true).order("sort_order").order("name").limit(40),
      client.from("provider_profiles").select("slug,business_name,city,provider_services!inner(id)").eq("status", "approved").eq("provider_services.is_active", true).is("provider_services.archived_at", null).not("slug", "is", null).order("business_name").limit(12),
      client.from("provider_services").select("id,title,provider_profiles!inner(slug,business_name,status)").eq("is_active", true).is("archived_at", null).eq("provider_profiles.status", "approved").order("title").limit(12),
    ]);

    const categories = categoryResult.status === "fulfilled" && !categoryResult.value.error && Array.isArray(categoryResult.value.data)
      ? categoryResult.value.data as unknown as PublicCategory[] : [];
    const providers = providerResult.status === "fulfilled" && !providerResult.value.error
      && Array.isArray(providerResult.value.data) ? providerResult.value.data as unknown as PublicProvider[] : [];
    const services = serviceResult.status === "fulfilled" && !serviceResult.value.error
      && Array.isArray(serviceResult.value.data) ? serviceResult.value.data as unknown as PublicService[] : [];
    return { categories, providers, services };
  } catch {
    return { categories: [], providers: [], services: [] };
  }
}

export async function HomeSeoDirectory() {
  const { categories, providers, services } = await loadDirectory();
  const cities = [...new Set(providers.map(provider => provider.city?.trim()).filter((city): city is string => Boolean(city)))].slice(0, 8);
  const websiteData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MATA Beauty",
    url: "https://mata-beauty.com/",
    inLanguage: "fr",
    description: "Découvrez et réservez des prestations beauté auprès des professionnels et salons publiés sur MATA Beauty.",
  };

  return <>
      {categories.length > 0 && <nav aria-label="Catégories de prestations beauté">
        <h2>Explorer les prestations</h2>
        <ul>{categories.map(category => <li key={category.id}><Link href={`/?search=1&applied=1&categoryId=${encodeURIComponent(category.id)}`}>{category.name}</Link></li>)}</ul>
      </nav>}
      {cities.length > 0 && <nav aria-label="Villes desservies par les professionnels publiés">
        <h2>Rechercher par ville</h2>
        <ul>{cities.map(city => <li key={city}><Link href={`/?search=1&applied=1&zone=${encodeURIComponent(city)}`}>{city}</Link></li>)}</ul>
      </nav>}
      {services.length > 0 && <nav aria-label="Prestations récemment publiées">
        <h2>Prestations disponibles</h2>
        <ul>{services.filter(service => service.provider_profiles?.slug).map(service => <li key={service.id}><Link href={`/service/${encodeURIComponent(service.id)}`}>{service.title} · {service.provider_profiles!.business_name}</Link></li>)}</ul>
      </nav>}
      {providers.length > 0 && <nav aria-label="Professionnels beauté publiés">
        <h2>Professionnels et salons</h2>
        <ul>{providers.map(provider => <li key={provider.slug}><Link href={`/professional/${encodeURIComponent(provider.slug)}`}>{provider.business_name}{provider.city ? ` · ${provider.city}` : ""}</Link></li>)}</ul>
      </nav>}
      <p className="seo-directory-note">Les fiches et disponibilités dépendent des informations publiées par chaque professionnel.</p>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteData).replace(/</g, "\\u003c") }} />
  </>;
}
