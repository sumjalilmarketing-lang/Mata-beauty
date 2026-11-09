import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn(), auth: vi.fn() }));
vi.mock("../../lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("../../lib/payments/server", () => ({
  authenticatedSupabase: mocks.auth,
  hasTrustedOrigin: () => true,
  applicationOrigin: () => "https://mata-beauty.com",
  serviceSupabase: vi.fn(),
  jsonError: (message: string, status: number, code: string) => Response.json({ error: { code, message } }, { status }),
}));
vi.mock("../../lib/teams/delivery", () => ({ deliverDepartmentInvitation: vi.fn() }));
vi.mock("../../lib/maps-rate-limit", () => ({ limitMapsRequest: vi.fn() }));
import { POST as accounts } from "../../app/api/admin/accounts/route";
import { POST as team } from "../../app/api/admin/team/route";
import { POST as departments } from "../../app/api/department-teams/route";
import { POST as distance } from "../../app/api/maps/distance/route";
import { POST as accept } from "../../app/api/salon/invitations/accept/route";

const id = "11111111-1111-4111-8111-111111111111";
const endpoints = [
  ["admin/accounts", accounts, { action: "preview", accounts: [{ userId: id, operationId: id }] }],
  ["admin/team", team, { action: "lookup", email: "test@example.test" }],
  ["department-teams", departments, { action: "hr-team", name: "Test", reason: "Test audit" }],
  ["maps/distance", distance, { origin: { latitude: 0, longitude: 0 }, destination: { latitude: 1, longitude: 1 } }],
  ["salon/invitations/accept", accept, { token: "a".repeat(43) }],
] as const;

function request(path: string, body: string, length?: string) {
  return new Request(`https://mata-beauty.com/api/${path}`, { method: "POST", headers: { origin: "https://mata-beauty.com", ...(length ? { "content-length": length } : {}) }, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED", "true");
  const client = { auth: { getUser: async () => ({ data: { user: { id } }, error: null }) }, rpc: mocks.rpc };
  mocks.client.mockResolvedValue(client);
  mocks.auth.mockResolvedValue({ user: { id }, client });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

describe.each(endpoints)("%s request validation", (path, handler, validBody) => {
  it("bounds actual body bytes even when the declared length is false", async () => {
    expect((await handler(request(path, JSON.stringify({ note: "x".repeat(20_000) }), "1"))).status).toBe(413);
    expect(mocks.rpc.mock.calls.every(([name]) => ["admin_list_team", "department_context"].includes(name))).toBe(true);
  });
  it("rejects unknown input keys before any mutation", async () => {
    expect((await handler(request(path, JSON.stringify({ ...validBody, unexpected: true })))).status).toBe(400);
    expect(mocks.rpc.mock.calls.every(([name]) => ["admin_list_team", "department_context"].includes(name))).toBe(true);
  });
  it("reports invalid JSON", async () => {
    expect((await handler(request(path, "{"))).status).toBe(400);
  });
});
