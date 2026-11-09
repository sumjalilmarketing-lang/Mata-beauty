import { describe, expect, it } from "vitest";
import { inspirationCountryCode, inspirationCountryLabel, inspirationSearchHistoryState, readInspirationSearchUrl } from "../../lib/domain/inspiration-search-url";

describe("Inspiration URL restoration", () => {
  it("rejects malformed and unknown countries before Intl rendering", () => {
    for (const country of ["INVALID", "<script>", "ZZ", "QQ", "ZZZ", "12", "", null, undefined]) expect(inspirationCountryCode(country)).toBe("");
    expect(inspirationCountryCode(" sn ")).toBe("SN");
    expect(inspirationCountryLabel("INVALID", "fr")).toBe("");
    expect(inspirationCountryLabel("SN", "fr")).toBe("Sénégal");
    expect(inspirationCountryLabel("SN", "not_a_locale")).toBe("SN");
  });

  it("restores every filter from a history entry and clears absent filters", () => {
    const state = { mataInspirationPosition: { latitude: 14.74, longitude: -17.51 } };
    const selected = readInspirationSearchUrl("?search=1&applied=1&q=tresses&categoryId=braids&country=sn&providerId=salon&zone=Dakar&radius=10", state);
    expect(selected).toEqual({ query: "tresses", categoryId: "braids", legacyCategory: "", countryCode: "SN", providerId: "salon", zone: "Dakar", radiusKm: 10, position: state.mataInspirationPosition, open: false });
    expect(readInspirationSearchUrl("", null)).toEqual({ query: "", categoryId: "", legacyCategory: "", countryCode: "", providerId: "", zone: "", radiusKm: 5, position: null, open: false });
    expect(readInspirationSearchUrl("?search=1&category=Tresses", null)).toMatchObject({ legacyCategory: "Tresses", open: true });
  });

  it("rejects forged coordinates and invalid radii without persisting GPS in a URL", () => {
    for (const position of [null, "14,17", { latitude: "14", longitude: 17 }, { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }]) {
      expect(readInspirationSearchUrl("?radius=999", { mataInspirationPosition: position })).toMatchObject({ radiusKm: 5, position: null });
    }
    const input = { __NA: true, tree: ["framework"], mataInspirationPosition: { latitude: 14, longitude: 17 } };
    expect(inspirationSearchHistoryState(input, null)).toEqual({ __NA: true, tree: ["framework"] });
    expect(input.mataInspirationPosition).toEqual({ latitude: 14, longitude: 17 });
    expect(inspirationSearchHistoryState(input, { latitude: 15, longitude: 18 })).toMatchObject({ __NA: true, mataInspirationPosition: { latitude: 15, longitude: 18 } });
  });

  it("bounds untrusted textual URL fields", () => {
    const result = readInspirationSearchUrl(`?q=${"x".repeat(500)}&zone=${"y".repeat(500)}&categoryId=${"z".repeat(500)}`, null);
    expect(result.query).toHaveLength(120);
    expect(result.zone).toHaveLength(120);
    expect(result.categoryId).toHaveLength(128);
  });
});
