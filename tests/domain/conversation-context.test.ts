import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/bookings/conversation-context/route";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), service: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({ authenticatedSupabase: mocks.authenticate, serviceSupabase: mocks.service }));
const bookingId = "a8c338c6-434d-42bb-916e-99a29f7e85ca";
const request = () => new Request("https://mata-beauty.com/api/bookings/conversation-context?booking=" + bookingId);
const booking = { client_id: "client", provider_id: "provider", starts_at: "2026-10-30T11:00:00Z", status: "confirmed" };
function authenticate(id: string, data: typeof booking | null, error: object | null = null, staffContext: object[] = []) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  mocks.authenticate.mockResolvedValue({ user: { id }, client: { from: () => query, rpc: vi.fn().mockResolvedValue({ data: staffContext, error: null }) } });
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
    authenticate("outsider", booking);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("respects an RLS-hidden booking", async () => {
    authenticate("client", null);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("fails closed on database errors", async () => {
    authenticate("client", null, { message: "unavailable" });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("returns only the public name and appointment context to a participant", async () => {
    authenticate("client", booking);
    mocks.service.mockReturnValue({ from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "profiles"
        ? { display_name: "Professionnelle", first_name: "Awa", last_name: "Fall" }
        : { business_name: "Salon Awa" }, error: null }) }) }),
    }) });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ name: "Salon Awa", startsAt: booking.starts_at, status: "confirmed" });
  });
  it("does not call the staff RPC when collaborator access is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED", "");
    const rpc = vi.fn();
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    mocks.authenticate.mockResolvedValue({ user: { id: "staff" }, client: { from: () => query, rpc } });
    expect((await GET(request())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("returns assigned staff context only through the permission-scoped RPC", async () => {
    vi.stubEnv("NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED", "true");
    authenticate("staff", null, null, [{ ...booking, service_title: "Tresses" }]);
    mocks.service.mockReturnValue({ from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: "Client Test", first_name: null, last_name: null }, error: null }) }) }),
    }) });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Client Test", startsAt: booking.starts_at, status: "confirmed" });
  });
});
