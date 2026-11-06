import { expect, it } from "vitest";
import { staffViewDays, staffVisibleAppointments } from "../../lib/domain/staff-schedule";
it("uses distinct daily, weekly and monthly periods", () => {
  expect([staffViewDays("dashboard"), staffViewDays("agenda"), staffViewDays("bookings")]).toEqual([1, 7, 31]);
});
it("handles actual client and provider cancellations without hiding them from history", () => {
  const rows = ["cancelled_by_client", "cancelled_by_provider", "declined", "confirmed"].map((status, index) => ({ starts_at: `2026-11-06T${10 + index}:00Z`, status }));
  expect(staffVisibleAppointments(rows, "agenda", "all").map(row => row.status)).toEqual(["confirmed"]);
  expect(staffVisibleAppointments(rows, "dashboard", "all").map(row => row.status)).toEqual(["confirmed"]);
  expect(staffVisibleAppointments(rows, "bookings", "cancelled").map(row => row.status)).toEqual(["cancelled_by_client", "cancelled_by_provider"]);
  expect(staffVisibleAppointments(rows, "bookings", "all")).toHaveLength(4);
});
it("keeps cancelled bookings in management history but removes them from the planning", () => {
  const rows = [{ starts_at: "2026-11-06T12:00Z", status: "confirmed" }, { starts_at: "2026-11-06T09:00Z", status: "cancelled" }, { starts_at: "2026-11-06T10:00Z", status: "pending" }];
  expect(staffVisibleAppointments(rows, "agenda", "all").map(row => row.status)).toEqual(["pending", "confirmed"]);
  expect(staffVisibleAppointments(rows, "bookings", "all")).toHaveLength(3);
  expect(staffVisibleAppointments(rows, "bookings", "cancelled")).toEqual([rows[1]]);
  expect(rows[0].status).toBe("confirmed");
});
