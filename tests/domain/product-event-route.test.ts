import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), serverRpc: vi.fn(), trusted: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("@/lib/payments/server", () => ({ hasTrustedOrigin: mocks.trusted, serviceSupabase: () => ({ rpc: mocks.serverRpc }) }));
import { POST } from "@/app/api/analytics/product-event/route";
import { anonymousAnalyticsKey } from "@/lib/analytics/server";

function request(body: unknown = { target_event_name: "search", target_session_hash: "a".repeat(64), target_properties: {} }, headers: Record<string, string> = {}) {
  return new Request("https://mata.example/api/analytics/product-event", { method: "POST", headers: { "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.1", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("ANALYTICS_SECURITY_PEPPER", "isolated-test-pepper-at-least-32-characters");
  mocks.trusted.mockReturnValue(true);
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  mocks.serverRpc.mockResolvedValue({ data: 1, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("keeps anonymous measurement but forwards only a keyed hash of trusted IP", async () => {
  expect((await POST(request())).status).toBe(204);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.serverRpc).toHaveBeenCalledWith("record_anonymous_product_event", expect.objectContaining({ target_ip_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  expect(JSON.stringify(mocks.serverRpc.mock.calls)).not.toContain("192.0.2.1");
});
it("uses the verified user client and never accepts a caller-supplied UID", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
  expect((await POST(request())).status).toBe(204);
  expect(mocks.rpc).toHaveBeenCalledWith("record_product_event", expect.objectContaining({ target_event_name: "search" }));
  expect(mocks.serverRpc).not.toHaveBeenCalled();
  expect((await POST(request({ target_event_name: "search", target_session_hash: "a".repeat(64), profile_id: "spoof" }))).status).toBe(400);
});
it("fails closed without a trusted IP, hosting boundary, pepper, or working auth verification", async () => {
  expect((await POST(request(undefined, { "x-vercel-forwarded-for": "", "x-forwarded-for": "192.0.2.2" }))).status).toBe(503);
  vi.stubEnv("VERCEL", "0"); expect((await POST(request())).status).toBe(503);
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("ANALYTICS_SECURITY_PEPPER", "short"); expect((await POST(request())).status).toBe(503);
  vi.stubEnv("ANALYTICS_SECURITY_PEPPER", "isolated-test-pepper-at-least-32-characters");
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError" } });
  expect((await POST(request())).status).toBe(503);
  expect(mocks.serverRpc).not.toHaveBeenCalled();
});
it("canonicalizes IPv6 and groups privacy addresses by network", () => {
  const key = anonymousAnalyticsKey(request(undefined, { "x-vercel-forwarded-for": "2001:db8:1:2::1" }));
  expect(key).toBe(anonymousAnalyticsKey(request(undefined, { "x-vercel-forwarded-for": "2001:0db8:0001:0002:abcd:ffff:1:2" })));
  expect(key).not.toBe(anonymousAnalyticsKey(request(undefined, { "x-vercel-forwarded-for": "2001:db8:1:3::1" })));
});
it("rejects forged IP lists, disallowed origins, malformed and oversized bodies", async () => {
  expect((await POST(request(undefined, { "x-vercel-forwarded-for": "192.0.2.1, 192.0.2.2" }))).status).toBe(503);
  mocks.trusted.mockReturnValue(false); expect((await POST(request())).status).toBe(403);
  mocks.trusted.mockReturnValue(true); expect((await POST(request({ target_event_name: "arbitrary" }))).status).toBe(400);
  expect((await POST(request({ payload: "x".repeat(17000) }))).status).toBe(413);
});
it("reports rate-limit or database failure without pretending to record an event", async () => {
  mocks.serverRpc.mockResolvedValue({ data: null, error: null }); expect((await POST(request())).status).toBe(429);
  mocks.serverRpc.mockResolvedValue({ data: null, error: { message: "unavailable" } }); expect((await POST(request())).status).toBe(503);
});
