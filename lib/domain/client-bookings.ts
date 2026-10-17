import type { BookingStatus } from "./booking";

export type ClientBookingItem = {
  id: string;
  groupId: string;
  providerId: string;
  providerName: string;
  providerSlug: string | null;
  providerImage: string | null;
  address: string | null;
  serviceId: string;
  serviceBookable: boolean;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  amount: number;
  currency: string;
};

export type ClientBookingGroup = {
  id: string;
  providerId: string;
  providerName: string;
  providerSlug: string | null;
  providerImage: string | null;
  address: string | null;
  bookings: ClientBookingItem[];
  activeCount: number;
  nextBooking: ClientBookingItem | null;
  latestClosedBooking: ClientBookingItem | null;
};

export type ClientBookingStatusTone = "confirmed" | "pending" | "closed" | "empty";

export function clientBookingStatusTone(status: BookingStatus): ClientBookingStatusTone {
  if (status === "confirmed" || status === "in_progress") return "confirmed";
  if (status === "pending" || status === "disputed") return "pending";
  if (status === "declined" || status === "cancelled_by_client" || status === "cancelled_by_provider") return "closed";
  return "empty";
}

const activeStatuses = new Set<BookingStatus>(["pending", "confirmed", "in_progress"]);
export function isActiveClientBooking(booking: ClientBookingItem, now: Date): boolean {
  return activeStatuses.has(booking.status) && (booking.status === "in_progress" || Date.parse(booking.endsAt) >= now.getTime());
}

export function groupClientBookings(items: readonly ClientBookingItem[], now = new Date()): ClientBookingGroup[] {
  const groups = new Map<string, ClientBookingGroup>();
  for (const item of new Map(items.map((item) => [item.id, item])).values()) {
    const current = groups.get(item.groupId);
    if (current) current.bookings.push(item);
    else groups.set(item.groupId, {
      id: item.groupId,
      providerId: item.providerId,
      providerName: item.providerName,
      providerSlug: item.providerSlug,
      providerImage: item.providerImage,
      address: item.address,
      bookings: [item],
      activeCount: 0,
      nextBooking: null,
      latestClosedBooking: null,
    });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.bookings.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
    const active = group.bookings.filter((booking) => isActiveClientBooking(booking, now));
    group.activeCount = active.length;
    group.nextBooking = active.find((booking) => Date.parse(booking.startsAt) >= now.getTime())
      ?? active.find((booking) => booking.status === "in_progress")
      ?? null;
    group.latestClosedBooking = [...group.bookings].reverse().find((booking) => !isActiveClientBooking(booking, now)) ?? null;
  }
  return result.sort((a, b) => {
    if (a.nextBooking && !b.nextBooking) return -1;
    if (!a.nextBooking && b.nextBooking) return 1;
    if (a.nextBooking && b.nextBooking) return Date.parse(a.nextBooking.startsAt) - Date.parse(b.nextBooking.startsAt);
    const aTime = Date.parse(a.bookings.at(-1)?.startsAt ?? "1970-01-01");
    const bTime = Date.parse(b.bookings.at(-1)?.startsAt ?? "1970-01-01");
    return bTime - aTime;
  });
}

