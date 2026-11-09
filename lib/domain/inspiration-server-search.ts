import { z } from "zod";
import type { InspirationSearchFilters } from "./inspiration-search";

export type InspirationFeedCursor = { publishedAt: string; id: string };
const uuid = z.uuid();

/** Invalid URL identities match nothing; they never turn into an unfiltered query. */
export function inspirationServerSearchArgs(filters: InspirationSearchFilters, cursor?: InspirationFeedCursor | null) {
  if ((filters.categoryId && !uuid.safeParse(filters.categoryId).success)
    || (filters.providerId && !uuid.safeParse(filters.providerId).success)) return null;
  return {
    target_query: filters.query.trim().slice(0, 120),
    target_category_id: filters.categoryId || null,
    target_country_code: filters.countryCode ?? "",
    target_provider_id: filters.providerId || null,
    target_zone: filters.position ? "" : filters.area.trim().slice(0, 120),
    target_latitude: filters.position?.latitude ?? null,
    target_longitude: filters.position?.longitude ?? null,
    target_radius_km: filters.radiusKm,
    before_published_at: cursor?.publishedAt ?? null,
    before_id: cursor?.id ?? null,
    page_size: 8,
  };
}
