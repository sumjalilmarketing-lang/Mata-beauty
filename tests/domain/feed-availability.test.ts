import { describe, expect, it } from "vitest";
import { feedAvailabilityWindow } from "@/lib/domain/feed-availability";
import { localDateAt } from "@/lib/domain/time-zone";

describe("public feed availability calendar coverage", () => {
  it.each([
    "2026-11-01T00:30:00Z", "2026-11-01T23:30:00Z",
    "2027-03-28T00:30:00Z", "2027-01-01T00:01:00Z",
  ])("includes each provider's local today and the next thirteen days at %s", (instant) => {
    const now = new Date(instant);
    const window = feedAvailabilityWindow(now);
    const last = new Date(`${window.from_date}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() + window.days - 1);
    for (const zone of ["America/New_York", "Europe/Paris", "Africa/Dakar", "Pacific/Kiritimati", "Etc/GMT+12"]) {
      const today = localDateAt(now, zone);
      const end = new Date(`${today}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 13);
      expect(window.from_date <= today).toBe(true);
      expect(last.toISOString().slice(0, 10) >= end.toISOString().slice(0, 10)).toBe(true);
    }
  });
});
