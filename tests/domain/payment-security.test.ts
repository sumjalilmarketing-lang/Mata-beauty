import { describe, expect, it } from "vitest";
import { isConsistentFinancialEvent, isWebhookFresh } from "../../lib/payments/security";

describe("financial event security", () => {
  const now = new Date("2026-08-04T10:00:00.000Z");

  it("accepts a recent webhook and rejects replayed or future events", () => {
    expect(isWebhookFresh(new Date("2026-08-04T09:59:00.000Z"), now)).toBe(true);
    expect(isWebhookFresh(new Date("2026-08-04T09:50:00.000Z"), now)).toBe(false);
    expect(isWebhookFresh(new Date("2026-08-04T10:10:00.000Z"), now)).toBe(false);
  });

  it("rejects amount, currency and reference substitution", () => {
    const expected = { amount: 10_000, currency: "XOF", reference: "token-1" };
    expect(isConsistentFinancialEvent(expected, expected)).toBe(true);
    expect(isConsistentFinancialEvent(expected, { ...expected, amount: 9_000 })).toBe(false);
    expect(isConsistentFinancialEvent(expected, { ...expected, currency: "EUR" })).toBe(false);
    expect(isConsistentFinancialEvent(expected, { ...expected, reference: "token-2" })).toBe(false);
  });
});
