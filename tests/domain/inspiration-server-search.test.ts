import { expect, it } from "vitest";
import { inspirationServerSearchArgs } from "../../lib/domain/inspiration-server-search";
import type { InspirationSearchFilters } from "../../lib/domain/inspiration-search";

const filters: InspirationSearchFilters = { query: " tresses ", categoryId: "", providerId: "", countryCode: "SN", area: "Dakar", position: null, radiusKm: 5 };
it("sends bounded filters and the entire stable cursor to the server", () => {
  const args = inspirationServerSearchArgs(filters, { publishedAt: "2026-11-09T12:00:00Z", id: "11111111-1111-4111-8111-111111111111" });
  expect(args).toMatchObject({ target_query: "tresses", target_country_code: "SN", target_zone: "Dakar", page_size: 8, before_published_at: "2026-11-09T12:00:00Z", before_id: "11111111-1111-4111-8111-111111111111" });
});
it("never turns an invalid selected identity into an unfiltered query", () => {
  expect(inspirationServerSearchArgs({ ...filters, categoryId: "__unavailable_category__" })).toBeNull();
  expect(inspirationServerSearchArgs({ ...filters, providerId: "not-a-uuid" })).toBeNull();
});
it("uses coordinates instead of applying a stale textual zone simultaneously", () => {
  expect(inspirationServerSearchArgs({ ...filters, position: { latitude: 14.74, longitude: -17.51 } })).toMatchObject({ target_zone: "", target_latitude: 14.74, target_longitude: -17.51, before_id: null, before_published_at: null });
});
