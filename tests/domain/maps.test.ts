import { describe, expect, it } from "vitest";
import { distanceKm, distanceTravelFee, googleDirectionsUrl, validGeoPoint } from "../../lib/maps";

describe("maps domain", () => {
  it("calcule une distance réaliste dans Dakar", () => {
    const distance = distanceKm(
      { latitude: 14.7167, longitude: -17.4677 },
      { latitude: 14.6928, longitude: -17.4467 },
    );
    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(4.5);
  });

  it("calcule les frais uniquement hors rayon gratuit", () => {
    expect(distanceTravelFee(4.2, 5, 500)).toBe(0);
    expect(distanceTravelFee(8.2, 5, 500)).toBe(2_000);
  });

  it("valide les coordonnées et produit un itinéraire Google", () => {
    expect(validGeoPoint({ latitude: 14.7, longitude: -17.4 })).toBe(true);
    expect(validGeoPoint({ latitude: 100, longitude: -17.4 })).toBe(false);
    const url = googleDirectionsUrl(
      { latitude: 14.7, longitude: -17.4 },
      { latitude: 14.72, longitude: -17.45 },
    );
    expect(url).toContain("https://www.google.com/maps/dir/");
    expect(url).toContain("travelmode=driving");
  });
});
