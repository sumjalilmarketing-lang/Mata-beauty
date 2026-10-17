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

const activeStatuses = new Set<BookingStatus>(["pending", "confirmed", "in_progress"]);
const closedStatuses = new Set<BookingStatus>(["declined", "cancelled_by_client", "cancelled_by_provider"]);

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
    group.nextBooking = active.find((booking) => Date.parse(booking.startsAt) >= now.getTime()) ?? null;
    group.latestClosedBooking = [...group.bookings].reverse().find((booking) => closedStatuses.has(booking.status)) ?? null;
  }
  return result.sort((a, b) => {
    const aTime = a.nextBooking ? Date.parse(a.nextBooking.startsAt) : Date.parse(a.bookings.at(-1)?.startsAt ?? "1970-01-01");
    const bTime = b.nextBooking ? Date.parse(b.nextBooking.startsAt) : Date.parse(b.bookings.at(-1)?.startsAt ?? "1970-01-01");
    return a.nextBooking && b.nextBooking ? aTime - bTime : bTime - aTime;
  });
}

