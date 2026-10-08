import { describe, expect, it } from "vitest";
import { feedPrice, publicProfessionalName } from "../../lib/domain/feed-presentation";
import { feedText } from "../../lib/domain/feed-copy";

describe("public feed presentation", () => {
  it("never substitutes a technical identifier for the public name", () => {
    expect(publicProfessionalName("Salon Fatoutoch2")).toBe("Salon Fatoutoch2");
    for (const name of [null, "", "provider-abc123", "@provider-abc", "12345678-1234-1234-1234-123456789abc"]) expect(publicProfessionalName(name)).toBe("Professionnel beauté");
  });
  it("retains original currency and decimals without conversion", () => {
    expect(feedPrice(15000,"XOF","fr")).toContain("XOF");
    expect(feedPrice(25.5,"EUR","en")).toContain("25.50");
    expect(feedPrice(25.5,"EUR","en")).not.toContain("XOF");
    expect(feedPrice(0,"XOF")).not.toBeNull();
    expect(feedPrice(15000,null)).toBeNull();
    expect(feedPrice(Number.NaN,"EUR")).toBeNull();
  });
  it("uses the selected language for essential actions", () => {
    expect(feedText("Voir les disponibilités","en-SN")).toBe("See availability");
    expect(feedText("Réserver","fr-SN")).toBe("Réserver");
  });
});
