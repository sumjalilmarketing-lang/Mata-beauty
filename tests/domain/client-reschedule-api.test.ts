import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), origin: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({
  authenticatedSupabase: mocks.auth, hasTrustedOrigin: mocks.origin,
  jsonError: (message: string, status: number, code: string) => Response.json({ ok: false, error: { code, message } }, { status }),
}));
import { GET, POST } from "../../app/api/bookings/reschedule/route";
const bookingId = "33333333-3333-4333-8333-333333333333";
const startsAt = "2026-12-01T10:00:00+00:00", endsAt = "2026-12-01T11:30:00+00:00";
const request = (body: unknown = { bookingId, startsAt }) => new Request("https://mata-beauty.com/api/bookings/reschedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function result(data: unknown, error: unknown = null) { return { abortSignal: vi.fn().mockResolvedValue({ data, error }) }; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.origin.mockReturnValue(true);
  mocks.auth.mockResolvedValue({ user: { id: "client" }, client: { rpc: mocks.rpc } });
  mocks.rpc.mockReturnValue(result({ id: bookingId, startsAt, endsAt }));
});
it("verifies the session and origin before accessing a booking", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  mocks.origin.mockReturnValue(false);
  expect((await POST(request())).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects malformed dates, identifiers and unauthorized payload fields", async () => {
  for (const body of [{ bookingId: "invalid", startsAt }, { bookingId, startsAt: "tomorrow" }, { bookingId, startsAt, total_amount: 1 }, { bookingId, startsAt, clientId: "other" }]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("bounds streamed bytes rather than trusting Content-Length", async () => {
  expect((await POST(request({ bookingId, startsAt, extra: "a".repeat(3000) }))).status).toBe(413);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("forwards only the target ID and instant and returns the confirmed server result", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("reschedule_client_booking", { target_booking_id: bookingId, target_starts_at: startsAt });
  expect(await response.json()).toEqual({ ok: true, booking: { id: bookingId, startsAt, endsAt } });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it.each([["23P01", 409], ["40001", 409], ["42501", 403], ["23514", 403], ["XX000", 503]])("handles %s without exposing database details", async (code, status) => {
  mocks.rpc.mockReturnValue(result(null, { code, message: "private SQL detail" }));
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain("private SQL detail");
});
it("does not announce success for a malformed or mismatched confirmation", async () => {
  mocks.rpc.mockReturnValue(result({ id: bookingId, startsAt: "bad", endsAt }));
  expect((await POST(request())).status).toBe(503);
  mocks.rpc.mockReturnValue(result({ id: "55555555-5555-4555-8555-555555555555", startsAt, endsAt }));
  expect((await POST(request())).status).toBe(503);
});
it("validates GET query params, including duplicates, and returned calendar rows", async () => {
  expect((await GET(new Request(`https://mata-beauty.com/api/bookings/reschedule?bookingId=${bookingId}&date=2026-02-31`))).status).toBe(400);
  expect((await GET(new Request(`https://mata-beauty.com/api/bookings/reschedule?bookingId=${bookingId}&date=2026-12-01&date=2026-12-02`))).status).toBe(400);
  mocks.rpc.mockReturnValue(result([{ slot_start: startsAt }]));
  const response = await GET(new Request(`https://mata-beauty.com/api/bookings/reschedule?bookingId=${bookingId}&date=2026-12-01`));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ slots: [{ slot_start: startsAt }] });
  mocks.rpc.mockReturnValue(result([{ slot_start: "not-a-date" }]));
  expect((await GET(new Request(`https://mata-beauty.com/api/bookings/reschedule?bookingId=${bookingId}&date=2026-12-01`))).status).toBe(503);
});
it("catches transport exceptions without a false confirmation", async () => {
  mocks.rpc.mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(new Error("private transport detail")) });
  expect((await POST(request())).status).toBe(503);
});
