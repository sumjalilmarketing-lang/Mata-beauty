import { describe, expect, it } from "vitest";
import { calculateAverageRating } from "../../lib/domain/reviews";

describe("review aggregates", () => {
  it("returns a one-decimal average", () => {
    expect(calculateAverageRating([5, 4, 5, 3])).toBe(4.3);
    expect(calculateAverageRating([])).toBe(0);
  });

  it("rejects invalid ratings", () => {
    expect(() => calculateAverageRating([0, 5])).toThrow(/1 et 5/);
  });
});
