import { describe, expect, it } from "vitest";
import { hasPublishedBusinessHours, validateWeeklyBusinessHours, type WeeklyBusinessHour } from "@/lib/domain/business-hours";

const closedDay = (weekday: number): WeeklyBusinessHour => ({ weekday, is_closed: true, opens_at: null, closes_at: null });

describe("weekly business hours", () => {
  it("does not treat a missing or fully closed schedule as published", () => {
    expect(hasPublishedBusinessHours([])).toBe(false);
    expect(hasPublishedBusinessHours([closedDay(0), closedDay(1)])).toBe(false);
    expect(validateWeeklyBusinessHours([closedDay(0), closedDay(1)])).toBe("Ajoutez au moins un jour d’ouverture.");
  });

  it("accepts explicitly published open hours alongside closed days", () => {
    const schedule = [closedDay(0), { weekday: 1, is_closed: false, opens_at: "09:00", closes_at: "17:30" }];
    expect(hasPublishedBusinessHours(schedule)).toBe(true);
    expect(validateWeeklyBusinessHours(schedule)).toBeNull();
  });

  it("rejects missing and reversed time ranges", () => {
    expect(validateWeeklyBusinessHours([{ weekday: 1, is_closed: false, opens_at: null, closes_at: "17:00" }])).toContain("heure de fermeture");
    expect(validateWeeklyBusinessHours([{ weekday: 1, is_closed: false, opens_at: "18:00", closes_at: "09:00" }])).toContain("heure de fermeture");
  });
});
