import { describe, expect, it } from "vitest";
import { filterInspirationPosts, validSearchRadius, type InspirationSearchFilters, type InspirationSearchPost, type InspirationSearchProvider } from "@/lib/domain/inspiration-search";

const providerA: InspirationSearchProvider = {
  profileId: "provider-a", serviceId: "service-braids", categoryId: "category-braids",
  name: "Élégance Dakar", specialty: "Tresses africaines", category: "Tresses",
  area: "Dakar, Almadies", address: "Rue des Tresses", coordinates: { latitude: 14.74, longitude: -17.51 },
};
const providerB: InspirationSearchProvider = {
  profileId: "provider-b", serviceId: "service-nails", categoryId: "category-nails",
  name: "Élégance Dakar", specialty: "Manucure", category: "Onglerie",
  area: "Dakar, Plateau", address: "Place de l’Indépendance", coordinates: { latitude: 14.67, longitude: -17.43 },
};
const posts: InspirationSearchPost[] = [
  { authorId: "provider-a", serviceId: "service-braids", businessName: "Élégance Dakar", serviceTitle: "Tresses africaines", city: "Dakar", caption: "Nattes protectrices", hashtags: ["tresses"] },
  { authorId: "provider-b", serviceId: "service-nails", businessName: "Élégance Dakar", serviceTitle: "Manucure", city: "Dakar", caption: "Ongles nude", hashtags: ["onglerie"] },
  { authorId: "provider-a", serviceId: "service-other", businessName: "Élégance Dakar", serviceTitle: "Coiffure", city: "Dakar", caption: "Autre prestation", hashtags: [] },
  { authorId: "unknown", serviceId: null, businessName: "Atelier inconnu", serviceTitle: null, city: "Dakar", caption: "Vidéo sans prestation", hashtags: [] },
];
const filters = (overrides: Partial<InspirationSearchFilters> = {}): InspirationSearchFilters => ({
  query: "", categoryId: "", providerId: "", area: "", position: null, radiusKm: 5, ...overrides,
});

describe("Inspiration discovery filters", () => {
  it("keeps the unfiltered feed intact", () => {
    expect(filterInspirationPosts(posts, [providerA, providerB], filters())).toEqual(posts);
  });

  it("filters by the exact service category id and matching author/service pair", () => {
    expect(filterInspirationPosts(posts, [providerA, providerB], filters({ categoryId: "category-braids" })))
      .toEqual([posts[0]]);
  });

  it("searches names without accent or case sensitivity", () => {
    expect(filterInspirationPosts(posts, [providerA, providerB], filters({ query: "elegance dakar" })))
      .toEqual([posts[0], posts[1], posts[2]]);
  });

  it("combines category, neighborhood and provider identity without merging homonyms", () => {
    expect(filterInspirationPosts(posts, [providerA, providerB], filters({
      categoryId: "category-braids", area: "Almadies", providerId: "provider-a",
    }))).toEqual([posts[0]]);
    expect(filterInspirationPosts(posts, [providerA, providerB], filters({
      categoryId: "category-braids", area: "Plateau",
    }))).toEqual([]);
  });

  it("uses only providers with coordinates within the chosen radius", () => {
    expect(filterInspirationPosts(posts, [providerA, providerB], filters({
      position: { latitude: 14.74, longitude: -17.51 }, radiusKm: 2,
    }))).toEqual([posts[0]]);
  });

  it("accepts only the requested geographic radii", () => {
    expect([2, 5, 10, 20, 25].map(validSearchRadius)).toEqual([2, 5, 10, 20, 5]);
  });
});
