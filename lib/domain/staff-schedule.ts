export type StaffView = "dashboard" | "agenda" | "bookings";
export function staffViewDays(view: StaffView) { return view === "dashboard" ? 1 : view === "agenda" ? 7 : 31; }
export function staffVisibleAppointments<T extends { starts_at: string; status: string }>(rows: T[], view: StaffView, status: string) {
  const cancelled = new Set(["cancelled", "cancelled_by_client", "cancelled_by_provider"]);
  return rows.filter(row => view === "bookings"
    ? status === "all" || (status === "cancelled" ? cancelled.has(row.status) : row.status === status)
    : !cancelled.has(row.status) && row.status !== "declined")
    .toSorted((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}
