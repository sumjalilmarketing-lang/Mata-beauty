import { describe, expect, it } from "vitest";
import { groupClientBookings, isActiveClientBooking, type ClientBookingItem } from "../../lib/domain/client-bookings";

const now = new Date("2026-10-17T12:00:00.000Z");
const booking = (overrides: Partial<ClientBookingItem> = {}): ClientBookingItem => ({
  id: crypto.randomUUID(), groupId: "business:salon-a", providerId: "owner-a", providerName: "Salon A", providerSlug: "salon-a", providerImage: null, address: "Dakar",
  serviceId: "service-1", serviceBookable: true, serviceName: "Tresses", startsAt: "2026-10-20T10:00:00.000Z", endsAt: "2026-10-20T11:00:00.000Z", status: "confirmed", amount: 12500, currency: "XOF", ...overrides,
});

describe("client booking groups", () => {
  it("groups multiple services and appointments by the real salon id", () => {
    const result = groupClientBookings([
      booking({ id: "one", serviceId: "braids", serviceName: "Tresses" }),
      booking({ id: "two", serviceId: "nails", serviceName: "Onglerie", startsAt: "2026-10-21T10:00:00.000Z" }),
    ], now);
    expect(result).toHaveLength(1);
    expect(result[0]?.bookings.map((item) => item.id)).toEqual(["one", "two"]);
    expect(result[0]?.activeCount).toBe(2);
    expect(result[0]?.nextBooking?.id).toBe("one");
  });

  it("keeps two salons distinct even when the service is identical", () => {
    const result = groupClientBookings([
      booking({ id: "one", groupId: "business:salon-a", serviceId: "same-service" }),
      booking({ id: "two", groupId: "business:salon-b", providerId: "owner-b", providerName: "Salon B", serviceId: "same-service" }),
    ], now);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((group) => group.id))).toEqual(new Set(["business:salon-a", "business:salon-b"]));
  });

  it("excludes cancelled, refused, completed and elapsed appointments from the active count", () => {
    const rows = [
      booking({ id: "pending", status: "pending" }),
      booking({ id: "cancelled", status: "cancelled_by_client" }),
      booking({ id: "refused", status: "declined" }),
      booking({ id: "done", status: "completed" }),
      booking({ id: "past", startsAt: "2026-10-16T10:00:00.000Z", endsAt: "2026-10-16T11:00:00.000Z" }),
    ];
    expect(groupClientBookings(rows, now)[0]?.activeCount).toBe(1);
    expect(isActiveClientBooking(rows[1]!, now)).toBe(false);
  });

  it("keeps an active appointment in progress active even if its start time is in the past", () => {
    const inProgress = booking({ status: "in_progress", startsAt: "2026-10-17T11:30:00.000Z", endsAt: "2026-10-17T12:30:00.000Z" });
    expect(isActiveClientBooking(inProgress, now)).toBe(true);
    expect(groupClientBookings([inProgress], now)[0]?.nextBooking?.id).toBe(inProgress.id);
  });

  it("preserves all records and orders each salon history chronologically", () => {
    const result = groupClientBookings([
      booking({ id: "late", startsAt: "2026-10-22T10:00:00.000Z" }),
      booking({ id: "early", startsAt: "2026-10-19T10:00:00.000Z", status: "completed" }),
      booking({ id: "middle", startsAt: "2026-10-20T10:00:00.000Z" }),
    ], now);
    expect(result[0]?.bookings.map((item) => item.id)).toEqual(["early", "middle", "late"]);
    expect(result[0]?.bookings).toHaveLength(3);
  });
});

