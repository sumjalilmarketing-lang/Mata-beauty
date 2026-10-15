import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/bookings/conversation-context/route";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), service: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({ authenticatedSupabase: mocks.authenticate, serviceSupabase: mocks.service }));
const bookingId = "a8c338c6-434d-42bb-916e-99a29f7e85ca";
const secondBookingId = "bbd00a1c-84c1-4c6d-b4fc-10e5662d17bd";
const booking = { id: bookingId, client_id: "client", provider_id: "provider", starts_at: "2026-10-30T11:00:00Z", status: "confirmed" };
const request = (ids = [bookingId]) => new Request(`https://mata-beauty.com/api/bookings/conversation-context?bookings=${ids.join(",")}`);

function query(data: unknown, error: object | null = null) {
  const value = Promise.resolve({ data, error });
  const chain = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnValue(value),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return chain;
}

function authenticate(id: string, visibleBookings: object[] | null, error: object | null = null, staffContext: object[] = []) {
  const bookingQuery = query(visibleBookings, error);
  const rpc = vi.fn().mockResolvedValue({ data: staffContext, error: null });
  mocks.authenticate.mockResolvedValue({ user: { id }, client: { from: () => bookingQuery, rpc } });
  return { bookingQuery, rpc };
}

function serviceFor(options: { name?: string; avatarUrl?: string | null; role?: string; username?: string | null; provider?: boolean; privacy?: string } = {}) {
  const profileId = options.provider ? "provider" : "client";
  mocks.service.mockReturnValue({ from: (table: string) => {
    const data = table === "profiles" ? [{
      id: profileId, display_name: options.name ?? "Professionnelle", first_name: null, last_name: null,
      username: options.username ?? null, role: options.role ?? (options.provider ? "provider" : "client"), avatar_url: options.avatarUrl ?? null,
    }] : table === "provider_profiles" ? (options.provider ? [{ profile_id: "provider", business_name: "Salon Awa", slug: null, status: "approved" }] : [])
      : table === "profile_privacy_settings" ? [{ profile_id: "client", profile_visibility: options.privacy ?? "private" }] : [];
    return query(data);
  } });
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("private conversation identity", () => {
  it("rejects unauthenticated access without reading profiles", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("rejects another client even if a broader role can read the booking", async () => {
    authenticate("outsider", [booking]);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("respects an RLS-hidden booking", async () => {
    authenticate("client", []);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("fails closed on database errors", async () => {
    authenticate("client", null, { message: "unavailable" });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("returns only identity and appointment context to a participant", async () => {
    authenticate("client", [booking]);
    serviceFor({ name: "Salon Awa", provider: true });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      bookings: [{ bookingId, participantId: "provider", name: "Salon Awa", avatarUrl: null, startsAt: booking.starts_at, status: "confirmed" }],
    });
  });

  it("checks every booking in a batch before returning any identity", async () => {
    authenticate("client", [booking]);
    expect((await GET(request([bookingId, secondBookingId]))).status).toBe(404);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("does not call the staff RPC when collaborator access is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED", "");
    const { bookingQuery, rpc } = authenticate("staff", []);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    expect(bookingQuery.in).toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("returns assigned staff context only through the permission-scoped RPC", async () => {
    vi.stubEnv("NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED", "true");
    const { bookingQuery, rpc } = authenticate("staff", [], null, [{ ...booking, service_title: "Tresses" }]);
    serviceFor({ name: "Client Test", role: "client", privacy: "private" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_staff_booking_context", { target_booking_id: bookingId });
    expect(bookingQuery.in).toHaveBeenCalled();
    expect(await response.json()).toEqual({
      bookings: [{ bookingId, participantId: "client", name: "Client Test", avatarUrl: null, startsAt: booking.starts_at, status: "confirmed" }],
    });
  });
});
