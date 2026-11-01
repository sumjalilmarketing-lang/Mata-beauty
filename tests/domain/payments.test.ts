import { describe, expect, it } from "vitest";
import { calculatePaymentQuote, canTransitionPayment, isTrustedSandboxCheckoutUrl, makeIdempotencyKey } from "../../lib/domain/payments";

describe("payment amounts", () => {
  it("calculates a full payment in integer minor units", () => {
    expect(calculatePaymentQuote({
      grossAmount: 10_000,
      mode: "full",
      commission: { percentageBasisPoints: 1_000, fixedAmount: 250 },
      providerFee: 200,
    })).toEqual({
      currency: "XOF", grossAmount: 10_000, payableAmount: 10_000, remainingAmount: 0,
      platformFee: 1_250, providerFee: 200, professionalNetAmount: 8_550,
    });
  });

  it("rounds an installment upward and leaves the balance", () => {
    const quote = calculatePaymentQuote({
      grossAmount: 9_999, mode: "deposit", depositBasisPoints: 3_000,
      commission: { percentageBasisPoints: 1_000, fixedAmount: 0 },
    });
    expect(quote.payableAmount).toBe(3_000);
    expect(quote.remainingAmount).toBe(6_999);
    expect(quote.platformFee).toBe(300);
  });

  it("never charges a free reservation", () => {
    expect(calculatePaymentQuote({ grossAmount: 5_000, mode: "free", commission: { percentageBasisPoints: 1_000, fixedAmount: 100 } }).payableAmount).toBe(0);
  });

  it("rejects floats and invalid rates", () => {
    expect(() => calculatePaymentQuote({ grossAmount: 1.5, mode: "full", commission: { percentageBasisPoints: 0, fixedAmount: 0 } })).toThrow();
    expect(() => calculatePaymentQuote({ grossAmount: 100, mode: "full", commission: { percentageBasisPoints: 10_001, fixedAmount: 0 } })).toThrow();
  });
});

describe("payment integrity", () => {
  it("builds stable attempt-scoped idempotency keys", () => {
    const input = { userId: "u", bookingId: "b", amount: 5000, attempt: "attempt-1" };
    expect(makeIdempotencyKey(input)).toBe(makeIdempotencyKey(input));
    expect(makeIdempotencyKey({ ...input, attempt: "attempt-2" })).not.toBe(makeIdempotencyKey(input));
  });

  it("allows only explicit payment transitions", () => {
    expect(canTransitionPayment("pending", "paid")).toBe(true);
    expect(canTransitionPayment("paid", "pending")).toBe(false);
    expect(canTransitionPayment("refunded", "paid")).toBe(false);
  });
});

describe("sandbox checkout redirects", () => {
  it("accepts only the exact HTTPS PayDunya sandbox invoice route", () => {
    expect(isTrustedSandboxCheckoutUrl("https://app.paydunya.com/sandbox-checkout/invoice/token-1")).toBe(true);
    expect(isTrustedSandboxCheckoutUrl("http://app.paydunya.com/sandbox-checkout/invoice/token-1")).toBe(false);
    expect(isTrustedSandboxCheckoutUrl("https://evil.example/sandbox-checkout/invoice/token-1")).toBe(false);
    expect(isTrustedSandboxCheckoutUrl("https://app.paydunya.com.evil.example/sandbox-checkout/invoice/token-1")).toBe(false);
  });
});
