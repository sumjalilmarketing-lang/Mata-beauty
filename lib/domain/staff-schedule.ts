export type StaffView = "dashboard" | "agenda" | "bookings";
export function staffViewDays(view: StaffView) { return view === "dashboard" ? 1 : view === "agenda" ? 7 : 31; }
export function staffVisibleAppointments<T extends { starts_at: string; status: string }>(rows: T[], view: StaffView, status: string) {
  return rows.filter(row => view === "bookings" ? status === "all" || row.status === status : !["cancelled", "declined"].includes(row.status))
    .toSorted((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}
