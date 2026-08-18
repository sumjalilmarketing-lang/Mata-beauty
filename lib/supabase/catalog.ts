import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogProvider = {
  id: string;
  profileId: string;
  serviceId: string;
  name: string;
  specialty: string;
  category: string;
  area: string;
  price: number;
  rating: number;
  reviews: number;
  verified: boolean;
  homeService: boolean;
  durationMinutes: number;
  businessId?: string;
  coverUrl?: string;
};

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
  provider_services: Array<{
    id: string;
    title: string;
    duration_minutes: number;
    price_amount: number;
    business_id: string | null;
    services: { name: string; categories: { name: string } | null } | null;
  }>;
};

export async function fetchPublishedProviders(client: SupabaseClient): Promise<CatalogProvider[]> {
  const { data, error } = await client
    .from("provider_profiles")
    .select(`
      profile_id,business_name,city,service_mode,average_rating,review_count,verified_at,cover_url,
      provider_services!inner(
        id,title,duration_minutes,price_amount,business_id,
        services(name,categories(name))
      )
    `)
    .eq("status", "approved")
    .eq("provider_services.status", "published")
    .eq("provider_services.is_active", true)
    .order("average_rating", { ascending: false })
    .limit(24);

  if (error) throw error;

  return ((data ?? []) as unknown as ProviderRecord[]).flatMap((provider) =>
    provider.provider_services.map((service) => ({
      id: service.id,
      profileId: provider.profile_id,
      serviceId: service.id,
      name: provider.business_name,
      specialty: service.title || service.services?.name || "Prestation beauté",
      category: service.services?.categories?.name || "Beauté",
      area: provider.city,
      price: service.price_amount,
      rating: Number(provider.average_rating),
      reviews: provider.review_count,
      verified: Boolean(provider.verified_at),
      homeService: provider.service_mode !== "salon",
      durationMinutes: service.duration_minutes,
      businessId: service.business_id ?? undefined,
      coverUrl: provider.cover_url ?? undefined,
    })),
  );
}

export async function fetchActiveCategories(client: SupabaseClient): Promise<CatalogCategory[]> {
  const { data, error } = await client
    .from("categories")
    .select("id,name,slug,icon,sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name")
    .limit(40);
  if (error) throw error;
  return (data ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
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
