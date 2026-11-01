import { describe, expect, it } from "vitest";
import { generateAvailableSlots } from "../../lib/domain/availability";
import { zonedWallTimeAt } from "../../lib/domain/time-zone";

const mondayRule = [{ weekday: 1, startsAt: "09:00", endsAt: "13:00", intervalMinutes: 30 }];

describe("availability generation in provider timezone", () => {
  it.each([
    ["Dakar", "Africa/Dakar", "2026-06-15T09:00:00.000Z"],
    ["Paris", "Europe/Paris", "2026-06-15T07:00:00.000Z"],
    ["New York", "America/New_York", "2026-06-15T13:00:00.000Z"],
    ["Brussels", "Europe/Brussels", "2026-06-15T07:00:00.000Z"],
    ["Madrid", "Europe/Madrid", "2026-06-15T07:00:00.000Z"],
  ])("keeps working hours local for %s", (_city, timeZone, expected) => {
    const slots = generateAvailableSlots({
      date: "2026-06-15", timeZone, rules: mondayRule, durationMinutes: 60,
      now: new Date("2026-06-14T00:00:00Z"), minimumNoticeMinutes: 0,
    });
    expect(slots[0]?.startsAt.toISOString()).toBe(expected);
  });

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

  it("generates France availability in local wall time and stores UTC instants", () => {
    const slots = generateAvailableSlots({
      date: "2026-06-15",
      timeZone: "Europe/Paris",
      rules: mondayRule,
      durationMinutes: 60,
      now: new Date("2026-06-14T00:00:00Z"),
      minimumNoticeMinutes: 0,
    });
    expect(slots[0]?.startsAt.toISOString()).toBe("2026-06-15T07:00:00.000Z");
  });

  it("omits nonexistent spring-forward times and includes both repeated fall-back instants", () => {
    const sunday = [{ weekday: 0, startsAt: "01:00", endsAt: "04:00", intervalMinutes: 30 }];
    const spring = generateAvailableSlots({
      date: "2026-03-29", timeZone: "Europe/Paris", rules: sunday, durationMinutes: 30,
      now: new Date("2026-03-28T00:00:00Z"), minimumNoticeMinutes: 0,
    });
    expect(spring.map((slot) => zonedWallTimeAt(slot.startsAt, "Europe/Paris").hour)).not.toContain(2);

    const fall = generateAvailableSlots({
      date: "2026-10-25", timeZone: "Europe/Paris", rules: sunday, durationMinutes: 30,
      now: new Date("2026-10-24T00:00:00Z"), minimumNoticeMinutes: 0,
    });
    expect(fall.filter((slot) => {
      const wall = zonedWallTimeAt(slot.startsAt, "Europe/Paris");
      return wall.hour === 2 && wall.minute === 30;
    })).toHaveLength(2);
  });

  it("moves New York salon hours with daylight saving changes", () => {
    const sunday = [{ weekday: 0, startsAt: "09:00", endsAt: "12:00", intervalMinutes: 30 }];
    const before = generateAvailableSlots({ date: "2026-03-01", timeZone: "America/New_York", rules: sunday, durationMinutes: 30, now: new Date("2026-02-28T00:00:00Z"), minimumNoticeMinutes: 0 });
    const after = generateAvailableSlots({ date: "2026-03-15", timeZone: "America/New_York", rules: sunday, durationMinutes: 30, now: new Date("2026-03-14T00:00:00Z"), minimumNoticeMinutes: 0 });
    expect(before[0]?.startsAt.toISOString()).toBe("2026-03-01T14:00:00.000Z");
    expect(after[0]?.startsAt.toISOString()).toBe("2026-03-15T13:00:00.000Z");
  });
  it.each([
    ["Europe/Paris", "2027-03-28", "2027-03-28T00:00:00.000Z"],
    ["America/New_York", "2027-03-14", "2027-03-14T06:00:00.000Z"],
  ])("fits elapsed duration before closing across the spring gap in %s", (timeZone, date, expected) => {
    const slots = generateAvailableSlots({ date, timeZone,
      rules: [{ weekday: 0, startsAt: "01:00", endsAt: "03:00", intervalMinutes: 30 }],
      durationMinutes: 60, now: new Date("2027-01-01T00:00:00Z"), minimumNoticeMinutes: 0 });
    expect(slots.map(slot => slot.startsAt.toISOString())).toEqual([expected]);
  });

  it("keeps the first repeated 02:30 when its elapsed duration still fits before closing", () => {
    const slots = generateAvailableSlots({ date: "2027-10-31", timeZone: "Europe/Paris",
      rules: [{ weekday: 0, startsAt: "01:00", endsAt: "03:00", intervalMinutes: 30 }],
      durationMinutes: 60, now: new Date("2027-01-01T00:00:00Z"), minimumNoticeMinutes: 0 });
    expect(slots.map(slot => slot.startsAt.toISOString())).toEqual([
      "2027-10-30T23:00:00.000Z", "2027-10-30T23:30:00.000Z", "2027-10-31T00:00:00.000Z",
      "2027-10-31T00:30:00.000Z", "2027-10-31T01:00:00.000Z",
    ]);
  });

});
