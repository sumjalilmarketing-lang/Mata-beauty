import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
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

function linkRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://mata-beauty.com/api/salon/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite_link", businessId: business, email: "fixture@outlook.com", role: "member", permissions: ["bookings.read"], ...overrides }) });
}
it("creates an owner-requested share link without email configuration or delivery claims", async () => {
  configure(); vi.stubEnv("RESEND_API_KEY", "");
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "create_business_invitation" ? invite : [] }));
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const response = await POST(linkRequest());
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body = await response.json();
  expect(body.deliveryState).toBe("link_only");
  const url = new URL(body.inviteUrl);
  expect(url.origin).toBe("https://mata-beauty.com");
  expect(url.pathname).toBe("/salon/invitation/accept");
  expect(url.search).toBe("");
  const token = new URLSearchParams(url.hash.slice(1)).get("token")!;
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["owner_list_business_invitations", "create_business_invitation"]);
  expect(mocks.rpc.mock.calls[1][1]).toEqual({ target_business_id: business, target_email: "fixture@outlook.com", target_role: "member", target_permissions: ["bookings.read"], target_token_hash: createHash("sha256").update(token).digest("hex") });
  expect(fetch).not.toHaveBeenCalled();
});
it("refuses a share link to an unauthenticated user", async () => {
  configure(); mocks.authenticated.mockResolvedValue(null);
  const response = await POST(linkRequest());
  expect(response.status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  expect(await response.text()).not.toContain("inviteUrl");
});
it("refuses a share link when owner authorization fails", async () => {
  configure(); mocks.rpc.mockResolvedValue({ error: { code: "42501" }, data: null });
  const response = await POST(linkRequest());
  expect(response.status).toBe(403);
  expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["owner_list_business_invitations"]);
  expect(await response.text()).not.toContain("inviteUrl");
});
it("keeps an existing pending invitation instead of silently replacing its secret", async () => {
  configure();
  mocks.rpc.mockImplementation(async (name: string) => name === "create_business_invitation" ? { error: { code: "P0001" }, data: null } : { error: null, data: [] });
  const response = await POST(linkRequest());
  expect(response.status).toBe(409); expect(await response.text()).not.toContain("inviteUrl");
  expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["owner_list_business_invitations", "create_business_invitation"]);
});
it("validates role and permissions for link invitations as strictly as email invitations", async () => {
  configure();
  expect((await POST(linkRequest({ role: "owner" }))).status).toBe(400);
  expect((await POST(linkRequest({ permissions: ["bookings.manage"] }))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("keeps email sending and provides its owner with the same fallback link", async () => {
  configure();
  const maybeSingle = vi.fn().mockResolvedValue({ data: { name: "Fixture salon" }, error: null });
  mocks.authenticated.mockResolvedValue({ client: { rpc: mocks.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }, user: { id: "owner" } });
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "create_business_invitation" ? invite : [] }));
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(Response.json({ id: receipt }));
  vi.stubGlobal("fetch", fetch);
  const response = await POST(linkRequest({ action: "invite", email: "fixture@hotmail.com" }));
  const body = await response.json();
  expect(response.status).toBe(201);
  expect(body.deliveryState).toBe("provider_accepted");
  const mail = JSON.parse(fetch.mock.calls[1][1].body);
  expect(mail.to).toEqual(["fixture@hotmail.com"]);
  expect(mail.text).toContain(body.inviteUrl);
  expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["owner_list_business_invitations", "create_business_invitation", "mark_business_invitation_sent", "record_business_invitation_receipt"]);
});
