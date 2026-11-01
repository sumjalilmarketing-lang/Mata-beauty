import { describe, expect, it } from "vitest";
import { distanceKm, matchesSearch } from "../../lib/domain/location";

describe("location matching and distances", () => {
  it("combines service, accents and location without depending on word order", () => {
    expect(matchesSearch("Tresses à Dakar", "Dakar · Tresses collées")).toBe(true);
    expect(matchesSearch("Ongles Mermoz", "Ongles · Almadies Dakar")).toBe(false);
    expect(matchesSearch("THIES", "Thiès")).toBe(true);
  });
  it("does not invent distances without valid coordinates", () => {
    const origin = { latitude: 14.7, longitude: -17.4 };
    expect(distanceKm(origin, undefined)).toBeNull();
    expect(distanceKm(origin, { latitude: 91, longitude: 0 })).toBeNull();
    expect(distanceKm(origin, origin)).toBe(0);
    expect(distanceKm(origin, { latitude: 14.71, longitude: -17.4 })).toBeCloseTo(1.112, 2);
  });
  it("matches the requested natural-language service and area examples", () => {
    expect(matchesSearch("Tresses près de moi", "Tresses collées Dakar")).toBe(true);
    expect(matchesSearch("Barber Dakar", "Barbier Dakar")).toBe(true);
    expect(matchesSearch("Massage Almadies", "Massage relaxant Almadies")).toBe(true);
    expect(matchesSearch("Ongles Mermoz", "Onglerie Mermoz")).toBe(true);
    expect(matchesSearch("Coiffeur homme Keur Massar", "Coiffure hommes Keur Massar")).toBe(true);
  });
  it("keeps every location and service constraint after synonym matching", () => {
    expect(matchesSearch("Barber Dakar", "Barbier Thiès")).toBe(false);
    expect(matchesSearch("Coiffeur homme Keur Massar", "Coiffure femme Keur Massar")).toBe(false);
    expect(matchesSearch("Massage Almadies", "Ongles Almadies")).toBe(false);
  });
});
