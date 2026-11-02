import { describe, expect, it } from "vitest";
import { formatServiceMoney } from "@/lib/domain/service-money";

describe("service price display", () => {
  it("preserves cents for international services instead of rounding the price", () => {
    expect(formatServiceMoney(12.5, "USD", "en-US")).toBe("$12.50");
    expect(formatServiceMoney(12.5, "EUR", "fr-FR")).toContain("12,50");
    expect(formatServiceMoney(12.5, "EUR", "es-ES")).toContain("12,50");
  });
  it("keeps currencies without minor units free of invented decimals", () => {
    expect(formatServiceMoney(12500, "XOF", "en-US")).toContain("12,500");
    expect(formatServiceMoney(12500, "XOF", "en-US")).not.toContain(".00");
  });
});
