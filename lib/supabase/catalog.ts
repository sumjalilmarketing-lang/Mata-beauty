import type { SupabaseClient } from "@supabase/supabase-js";
import { categorySlugFor, serviceVisual, type CategoryMedia } from "@/lib/catalog/category-media";

export type CatalogProvider = {
  id: string;
  profileId: string;
  serviceId: string;
  categoryId?: string;
  countryCode?: string;
  country?: string;
  name: string;
  specialty: string;
  category: string;
  area: string;
  address?: string;
  coordinates?: { latitude: number; longitude: number };
  price: number;
  rating: number;
  reviews: number;
  verified: boolean;
  homeService: boolean;
  durationMinutes: number;
  businessId?: string;
  coverUrl?: string;
  serviceMedia?: CategoryMedia;
};

function countryName(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  try { return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code; }
  catch { return code; }
}

export type CatalogPromotion = {
  id: string;
  title: string;
  description: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  endsAt: string;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  imagePosition: string | null;
  sortOrder: number;
};

type ProviderRecord = {
  profile_id: string;
  business_name: string;
  city: string;
  service_mode: "salon" | "mobile" | "both";
  average_rating: number | string;
  review_count: number;
  verified_at: string | null;
  cover_url: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  profiles: { country_code: string | null } | null;
  provider_services: Array<{
    id: string;
    title: string;
    duration_minutes: number;
    price_amount: number;
    business_id: string | null;
    businesses: { address: string; city: string; area: string | null; latitude: number | null; longitude: number | null } | null;
    services: { name: string; categories: { id: string; name: string } | null } | null;
  }>;
};

export async function fetchPublishedProviders(client: SupabaseClient, providerId?: string, signal?: AbortSignal): Promise<CatalogProvider[]> {
  const records: ProviderRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    let query = client
    .from("provider_profiles")
    .select(`
      profile_id,business_name,city,service_mode,average_rating,review_count,verified_at,cover_url,latitude,longitude,profiles(country_code),
      provider_services!inner(
        id,title,duration_minutes,price_amount,business_id,
        businesses(address,city,area,latitude,longitude),
        services(name,categories(id,name))
      )
    `)
    .eq("status", "approved")
    .eq("provider_services.is_active", true)
    .order("average_rating", { ascending: false })
    .order("profile_id")
    .range(offset, offset + 99);
  if (providerId) query = query.eq("profile_id", providerId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;

  if (error) throw error;
    const batch = (data ?? []) as unknown as ProviderRecord[];
    records.push(...batch);
    if (batch.length < 100) break;
  }

  const serviceIds = records.flatMap(provider => provider.provider_services.map(service => service.id));
  const covers = new Map<string, string>();
  const postIds = new Map<string, string>();
  // Optional enrichment: older catalog schemas can still use exact-category editorial media.
  for (let offset = 0; offset < serviceIds.length; offset += 100) {
    let request = client.from("provider_services").select("*").in("id", serviceIds.slice(offset, offset + 100));
    if (signal) request = request.abortSignal(signal);
    const result = await request;
    if (result.error) break;
    for (const row of result.data ?? []) if (typeof row.cover_url === "string" && row.cover_url) covers.set(row.id, row.cover_url);
  }
  // Only published, publicly readable posts linked to this exact service qualify.
  // Keep the original identifiers and Storage object; never copy a professional's media.
  const missing = serviceIds.filter(id => !covers.has(id));
  for (let offset = 0; offset < missing.length; offset += 100) {
    let request = client.from("social_feed").select("id,author_id,provider_service_id,thumbnail_url,media_items").in("provider_service_id", missing.slice(offset, offset + 100)).order("published_at", { ascending: false }).limit(100);
    if (signal) request = request.abortSignal(signal);
    const result = await request;
    if (result.error) break;
    type MediaPost = { id: string; author_id: string; provider_service_id: string; thumbnail_url: string | null; media_items: Array<{ media_type: string; bucket_id: string; storage_path: string; thumbnail_path: string | null }> | null };
    const candidates = new Map<string, MediaPost>();
    for (const post of (result.data ?? []) as unknown as MediaPost[]) {
      if (!covers.has(post.provider_service_id) && !candidates.has(post.provider_service_id) && records.some(provider => provider.profile_id === post.author_id && provider.provider_services.some(service => service.id === post.provider_service_id))) candidates.set(post.provider_service_id, post);
    }
    const posts = [...candidates.values()];
    for (let start = 0; start < posts.length; start += 8) await Promise.all(posts.slice(start, start + 8).map(async post => {
      const media = post.media_items?.[0];
      const path = media?.media_type === "image" ? media.storage_path : media?.thumbnail_path;
      let src = post.thumbnail_url;
      if (media?.bucket_id === "provider-social-media" && path?.startsWith(`${post.author_id}/`)) {
        const signed = await client.storage.from(media.bucket_id).createSignedUrl(path, 3600);
        src = signed.data?.signedUrl ?? src;
      }
      if (src) { covers.set(post.provider_service_id, src); postIds.set(post.provider_service_id, post.id); }
    }));
  }
  return records.flatMap((provider) =>
    provider.provider_services.map((service) => ({
      id: service.id,
      profileId: provider.profile_id,
      serviceId: service.id,
      categoryId: service.services?.categories?.id,
      name: provider.business_name,
      specialty: service.title || service.services?.name || "Prestation beauté",
      category: service.services?.categories?.name || "Beauté",
      area: [service.businesses?.area, service.businesses?.city ?? provider.city, countryName(provider.profiles?.country_code)]
        .filter((value): value is string => Boolean(value)).join(", "),
      address: service.businesses?.address || undefined,
      coordinates: service.businesses?.latitude != null && service.businesses.longitude != null
        ? { latitude: Number(service.businesses.latitude), longitude: Number(service.businesses.longitude) }
        : provider.latitude != null && provider.longitude != null
          ? { latitude: Number(provider.latitude), longitude: Number(provider.longitude) } : undefined,
      countryCode: provider.profiles?.country_code ?? undefined,
      country: countryName(provider.profiles?.country_code),
      price: service.price_amount,
      rating: Number(provider.average_rating),
      reviews: provider.review_count,
      verified: Boolean(provider.verified_at),
      homeService: provider.service_mode !== "salon",
      durationMinutes: service.duration_minutes,
      businessId: service.business_id ?? undefined,
      coverUrl: serviceVisual(service.services?.categories?.name ?? "", covers.get(service.id)),
      serviceMedia: covers.has(service.id) && categorySlugFor(service.services?.categories?.name ?? "") ? {
        src: covers.get(service.id)!, alt: service.title, origin: "professional" as const,
        categorySlug: categorySlugFor(service.services?.categories?.name ?? "")!, providerId: provider.profile_id, serviceId: service.id, postId: postIds.get(service.id),
      } : undefined,
    })),
  );
}

export async function fetchActiveCategories(client: SupabaseClient): Promise<CatalogCategory[]> {
  const enriched = await client
    .from("categories")
    .select("id,name,slug,icon,image_url,image_position,sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name")
    .limit(40);
  const fallback = enriched.error ? await client.from("categories").select("id,name,slug,icon,image_url,sort_order").eq("is_active", true).order("sort_order").order("name").limit(40) : null;
  if (enriched.error && fallback?.error) throw fallback.error;
  const data = (enriched.error ? fallback?.data : enriched.data) ?? [];
  return data.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    imageUrl: category.image_url,
    imagePosition: "image_position" in category && typeof category.image_position === "string" ? category.image_position : null,
    sortOrder: category.sort_order,
  }));
}

export async function fetchActivePromotions(client: SupabaseClient): Promise<CatalogPromotion[]> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("promotions")
    .select("id,title,description,discount_type,discount_value,ends_at")
    .eq("is_active", true)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("ends_at", { ascending: true })
    .limit(6);
  if (error) throw error;
  return (data ?? []).map((promotion) => ({
    id: promotion.id,
    title: promotion.title,
    description: promotion.description,
    discountType: promotion.discount_type,
    discountValue: promotion.discount_value,
    endsAt: promotion.ends_at,
  }));
}
