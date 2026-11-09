import { expect, it } from "vitest";
import { previewServiceSelection, type BookableService } from "../../lib/domain/multi-service-selection";

const face: BookableService = { id: "11111111-1111-4111-8111-111111111111", title: "Soin visage", duration_minutes: 45, price_amount: 15000, currency: "XOF" };
const nails: BookableService = { ...face, id: "22222222-2222-4222-8222-222222222222", title: "Manucure", duration_minutes: 30, price_amount: 5000 };

it("previews a continuous 75-minute selection and both prices", () => {
  expect(previewServiceSelection([face, nails])).toEqual({ title: "Soin visage + Manucure", durationMinutes: 75, totalAmount: 20000, currency: "XOF" });
});
it("rejects duplicates, mixed currencies, cross-salon and oversized selections", () => {
  for (const selection of [[], [face, face], [face, { ...nails, currency: "EUR" as const }], [face, { ...nails, business_id: "33333333-3333-4333-8333-333333333333" }], [{ ...face, duration_minutes: 720 }, nails]]) {
    expect(() => previewServiceSelection(selection)).toThrow();
  }
});
