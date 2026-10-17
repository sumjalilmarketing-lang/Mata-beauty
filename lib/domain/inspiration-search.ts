import { distanceKm, matchesSearch, type Coordinates } from "@/lib/domain/location";

export type InspirationSearchProvider = {
  profileId: string;
  serviceId: string;
  categoryId?: string;
  country?: string;
  name: string;
  specialty: string;
  category: string;
  area: string;
  address?: string;
  coordinates?: Coordinates;
};

export type InspirationSearchPost = {
  authorId: string;
  serviceId: string | null;
  businessName: string;
  serviceTitle: string | null;
  city: string;
  caption: string;
  hashtags: string[];
};

export type InspirationSearchFilters = {
  query: string;
  categoryId: string;
  providerId: string;
  area: string;
  position: Coordinates | null;
  radiusKm: number;
};

const hasFilters = (filters: InspirationSearchFilters) => Boolean(
  filters.query.trim() || filters.categoryId || filters.providerId || filters.area.trim() || filters.position,
);

export function filterInspirationPosts<T extends InspirationSearchPost>(
  posts: T[],
  providers: InspirationSearchProvider[],
  filters: InspirationSearchFilters,
): T[] {
  if (!hasFilters(filters)) return posts;

  return posts.filter((post) => {
    const provider = post.serviceId
      ? providers.find((item) => item.profileId === post.authorId && item.serviceId === post.serviceId)
      : undefined;

    if (filters.providerId && post.authorId !== filters.providerId) return false;
    if (filters.categoryId && (!provider || provider.categoryId !== filters.categoryId)) return false;

    if (filters.position) {
      const distance = distanceKm(filters.position, provider?.coordinates);
      if (distance === null || distance > filters.radiusKm) return false;
    } else if (filters.area.trim()) {
      const place = `${provider?.area ?? post.city} ${provider?.address ?? ""} ${post.city}`;
      if (!matchesSearch(filters.area, place)) return false;
    }

    if (filters.query.trim()) {
      const searchable = [
        post.businessName,
        post.serviceTitle ?? "",
        post.caption,
        post.city,
        ...post.hashtags,
        provider?.name ?? "",
        provider?.specialty ?? "",
        provider?.category ?? "",
        provider?.country ?? "",
        provider?.area ?? "",
        provider?.address ?? "",
      ].join(" ");
      if (!matchesSearch(filters.query, searchable)) return false;
    }

    return true;
  });
}

export function validSearchRadius(value: number): 2 | 5 | 10 | 20 {
  return value === 2 || value === 5 || value === 10 || value === 20 ? value : 5;
}
