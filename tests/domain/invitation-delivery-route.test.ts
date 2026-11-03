import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authenticated: vi.fn() }));
vi.mock("@/lib/payments/server", () => ({
  authenticatedSupabase: mocks.authenticated,
  hasTrustedOrigin: () => true,
  applicationOrigin: () => "https://mata-beauty.com",
  jsonError: (message: string, status: number, code: string) => Response.json({ error: { message, code } }, { status }),
}));
import { GET, POST } from "@/app/api/salon/team/route";
const business = "11111111-1111-4111-8111-111111111111";
const invite = "22222222-2222-4222-8222-222222222222";
const receipt = "33333333-3333-4333-8333-333333333333";
const request = () => new Request(`https://mata-beauty.com/api/salon/team?businessId=${business}&invitationId=${invite}`);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function configure() {
  vi.stubEnv("NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "test-only-not-a-real-key");
  mocks.authenticated.mockResolvedValue({ client: { rpc: mocks.rpc }, user: { id: "owner" } });
}
it("does not consult the provider for unauthenticated users", async () => {
  configure(); mocks.authenticated.mockResolvedValue(null);
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await GET(request())).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not disclose delivery data when the owner RPC denies access", async () => {
  configure(); mocks.rpc.mockResolvedValue({ error: { code: "42501" }, data: null });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await GET(request())).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not invent delivery confirmation for an old invitation without receipt", async () => {
  configure(); mocks.rpc.mockResolvedValue({ error: null, data: [] });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const response = await GET(request());
  expect((await response.json()).message).toContain("réception n’est pas confirmée");
  expect(fetch).not.toHaveBeenCalled();
});
it("returns a rejection without exposing provider payloads, recipients or keys", async () => {
  configure();
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "owner_list_collaborator_audit" ? [{ invitation_id: invite, details: { resend_email_id: receipt } }] : [] }));
  const fetch = vi.fn().mockResolvedValue(Response.json({ last_event: "bounced", to: ["private@example.test"] }));
  vi.stubGlobal("fetch", fetch);
  const response = await GET(request()); const text = await response.text();
  expect(text).toContain("rejeté"); expect(text).not.toContain("private@example.test"); expect(text).not.toContain("test-only");
  expect(fetch.mock.calls[0][0]).toBe(`https://api.resend.com/emails/${receipt}`);
});

it("does not create or send another invitation to a suppressed address", async () => {
  configure(); mocks.rpc.mockResolvedValue({ error: null, data: [] });
  const fetch = vi.fn().mockResolvedValue(Response.json({ origin: "bounce" })); vi.stubGlobal("fetch", fetch);
  const response = await POST(new Request("https://mata-beauty.com/api/salon/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", businessId: business, email: "fixture@outlook.com", role: "member", permissions: ["bookings.read"] }) }));
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("recipient_suppressed");
  expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["owner_list_business_invitations"]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain("/suppressions/");
});
it("checks owner authorization before asking about a recipient", async () => {
  configure(); mocks.rpc.mockResolvedValue({ error: { code: "42501" }, data: null });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const response = await POST(new Request("https://mata-beauty.com/api/salon/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", businessId: business, email: "fixture@outlook.com", role: "member", permissions: ["bookings.read"] }) }));
  expect(response.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
});
