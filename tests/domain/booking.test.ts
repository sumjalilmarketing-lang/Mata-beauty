import { describe, expect, it } from "vitest";
import {
  calculateBookingEnd,
  calculateBookingQuote,
  canClientCancel,
  canTransitionBooking,
} from "../../lib/domain/booking";

describe("booking rules", () => {
  it("calculates integer FCFA totals without rounding", () => {
    expect(calculateBookingQuote(15_000, 2_500)).toEqual({
      serviceAmount: 15_000,
      travelFee: 2_500,
      totalAmount: 17_500,
      currency: "XOF",
    });
    expect(() => calculateBookingQuote(10.5)).toThrow(/entier/);
  });

  it("calculates the service end", () => {
    const start = new Date("2026-07-28T14:30:00.000Z");
    expect(calculateBookingEnd(start, 90).toISOString()).toBe("2026-07-28T16:00:00.000Z");
  });

  it("rejects forbidden status jumps", () => {
    expect(canTransitionBooking("pending", "confirmed")).toBe(true);
    expect(canTransitionBooking("pending", "completed")).toBe(false);
    expect(canTransitionBooking("completed", "confirmed")).toBe(false);
  });

  it("enforces the cancellation notice", () => {
    const now = new Date("2026-07-25T12:00:00.000Z");
    expect(canClientCancel(new Date("2026-07-27T12:00:00.000Z"), now)).toBe(true);
    expect(canClientCancel(new Date("2026-07-25T20:00:00.000Z"), now)).toBe(false);
  });
});
