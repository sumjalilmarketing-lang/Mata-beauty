import { describe, expect, it } from "vitest";
import { bookingAvailabilitySchema } from "../../lib/domain/booking-availability";

describe("public booking availability response", () => {
  it("accepts independent slots and empty calendars", () => {
    expect(bookingAvailabilitySchema.safeParse({ teamEnabled: false, slots: [] }).success).toBe(true);
    expect(bookingAvailabilitySchema.safeParse({ teamEnabled: false, slots: [{ slot_start: "2026-11-10T10:00:00+00:00" }] }).success).toBe(true);
  });

  it("rejects malformed responses instead of leaving the calendar loading", () => {
    for (const data of [null, {}, { teamEnabled: false, slots: null }, { teamEnabled: false, slots: [{ slot_start: "invalid" }] }, { teamEnabled: true, slots: [{ slot_start: "2026-11-10T10:00:00Z" }] }]) {
      expect(bookingAvailabilitySchema.safeParse(data).success).toBe(false);
    }
  });

  it("preserves a qualified roster on a fully booked day", () => {
    const data = { teamEnabled: true, people: [{ collaborator_id: "11111111-1111-4111-8111-111111111111", display_name: "Lisa", title: null, avatar_url: null, specialties: ["Ongles"] }], slots: [] };
    expect(bookingAvailabilitySchema.parse(data)).toEqual(data);
  });
});
