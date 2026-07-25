import { describe, expect, it } from "vitest";
import { generateAvailableSlots } from "../../lib/domain/availability";

const mondayRule = [{ weekday: 1, startsAt: "09:00", endsAt: "13:00", intervalMinutes: 30 }];

describe("availability generation in Africa/Dakar", () => {
  it("fits the duration inside opening hours", () => {
    const slots = generateAvailableSlots({
      date: "2026-07-27",
      durationMinutes: 90,
      rules: mondayRule,
      now: new Date("2026-07-25T08:00:00.000Z"),
      minimumNoticeMinutes: 0,
    });
    expect(slots.map((slot) => slot.startsAt.toISOString().slice(11, 16))).toEqual([
      "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    ]);
  });

  it("removes an already booked range", () => {
    const slots = generateAvailableSlots({
      date: "2026-07-27",
      durationMinutes: 60,
      rules: mondayRule,
      now: new Date("2026-07-25T08:00:00.000Z"),
      minimumNoticeMinutes: 0,
      blockedRanges: [{
        startsAt: new Date("2026-07-27T10:00:00.000Z"),
        endsAt: new Date("2026-07-27T11:00:00.000Z"),
      }],
    });
    expect(slots.some((slot) => slot.startsAt.toISOString().includes("10:00"))).toBe(false);
    expect(slots.some((slot) => slot.startsAt.toISOString().includes("10:30"))).toBe(false);
  });

  it("releases a cancelled booking because only active ranges are passed", () => {
    const slots = generateAvailableSlots({
      date: "2026-07-27",
      durationMinutes: 60,
      rules: mondayRule,
      blockedRanges: [],
      now: new Date("2026-07-25T08:00:00.000Z"),
      minimumNoticeMinutes: 0,
    });
    expect(slots.some((slot) => slot.startsAt.toISOString().includes("10:00"))).toBe(true);
  });
});
