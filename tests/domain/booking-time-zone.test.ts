import { describe, expect, it } from "vitest";
import { bookingTimeZone } from "../../lib/domain/booking-time-zone";
import { zonedWallTimeAt } from "../../lib/domain/time-zone";

describe("appointment clock in a multi-country provider inbox", () => {
  it("shows the New York test appointment at 14:00, rather than the Paris owner's 20:00", () => {
    const zone = bookingTimeZone("America/New_York", "Europe/Paris", "FR");
    expect(zonedWallTimeAt(new Date("2026-11-02T19:00:00Z"), zone)).toMatchObject({ hour: 14, minute: 0 });
  });
  it("keeps independent Paris appointments in the provider's local clock", () => {
    expect(zonedWallTimeAt(new Date("2026-11-02T16:00:00Z"), bookingTimeZone(null, "Europe/Paris", "FR"))).toMatchObject({ hour: 17 });
  });
  it("uses the establishment's date across midnight and summer time", () => {
    expect(zonedWallTimeAt(new Date("2026-07-01T02:00:00Z"), bookingTimeZone("America/New_York", "Europe/Paris"))).toMatchObject({ month: 6, day: 30, hour: 22 });
  });
  it("tolerates invalid legacy zones without silently using the browser's clock", () => {
    expect(bookingTimeZone("Mars/Olympus", "Europe/Paris")).toBe("Europe/Paris");
    expect(bookingTimeZone(null, "invalid", "SN")).toBe("Africa/Dakar");
    expect(bookingTimeZone(null, null, "FR")).toBe("UTC");
  });
});
