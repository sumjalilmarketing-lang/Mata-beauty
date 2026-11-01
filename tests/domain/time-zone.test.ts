import { describe, expect, it } from "vitest";
import { isIanaTimeZone, localDateTimeInputToInstant, localWallTimeToInstants, zonedWallTimeAt } from "../../lib/domain/time-zone";

describe("IANA timezone resolution", () => {
  it.each([
    ["Dakar", "Africa/Dakar", "2026-06-15T10:30:00.000Z"],
    ["Paris", "Europe/Paris", "2026-06-15T08:30:00.000Z"],
    ["New York", "America/New_York", "2026-06-15T14:30:00.000Z"],
    ["Brussels", "Europe/Brussels", "2026-06-15T08:30:00.000Z"],
    ["Madrid", "Europe/Madrid", "2026-06-15T08:30:00.000Z"],
  ])("resolves a local booking time for %s", (_city, timeZone, expected) => {
    const dates = localWallTimeToInstants({ year: 2026, month: 6, day: 15, hour: 10, minute: 30 }, timeZone);
    expect(dates.map((date) => date.toISOString())).toEqual([expected]);
  });

  it("returns no instant for the spring-forward gap in Paris and New York", () => {
    expect(localWallTimeToInstants({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, "Europe/Paris")).toEqual([]);
    expect(localWallTimeToInstants({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, "America/New_York")).toEqual([]);
  });

  it("returns both instants for repeated fall-back times", () => {
    expect(localWallTimeToInstants({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, "Europe/Paris").map((date) => date.toISOString()))
      .toEqual(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]);
    expect(localWallTimeToInstants({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, "America/New_York").map((date) => date.toISOString()))
      .toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
  });

  it("resolves local datetime inputs to explicit UTC instants and handles repeated boundaries", () => {
    expect(localDateTimeInputToInstant("2026-06-15T09:00", "Europe/Paris").toISOString()).toBe("2026-06-15T07:00:00.000Z");
    expect(localDateTimeInputToInstant("2026-10-25T02:30", "Europe/Paris", "start").toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(localDateTimeInputToInstant("2026-10-25T02:30", "Europe/Paris", "end").toISOString()).toBe("2026-10-25T01:30:00.000Z");
    expect(() => localDateTimeInputToInstant("2026-03-29T02:30", "Europe/Paris")).toThrow(/n’existe pas/);
  });

  it("rejects unknown timezone identifiers and reports a wall time from an instant", () => {
    expect(isIanaTimeZone("Mars/Olympus")).toBe(false);
    expect(() => localWallTimeToInstants({ year: 2026, month: 1, day: 1, hour: 9, minute: 0 }, "Mars/Olympus")).toThrow(/IANA/);
    expect(zonedWallTimeAt(new Date("2026-06-15T08:30:00Z"), "Europe/Paris")).toMatchObject({ year: 2026, month: 6, day: 15, hour: 10, minute: 30 });
  });
});
