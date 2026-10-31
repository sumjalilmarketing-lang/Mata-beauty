import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), service: vi.fn() }));
vi.mock("../../lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({
  auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
}) }));
vi.mock("../../lib/payments/server", () => ({
  applicationOrigin: (request: Request) => new URL(request.url).origin, serviceSupabase: mocks.service,
}));
import { POST } from "../../app/api/admin/team/route";

const actorId = "00000000-0000-4000-8000-000000000001";
const candidateId = "00000000-0000-4000-8000-000000000002";
const origin = "https://mata-beauty-test.vercel.app";
const email = "operator@example.test";
const candidate = { user_id: candidateId, email, display_name: "QA operator", is_suspended: false };
const request = (body: unknown, from = origin) => new Request(`${origin}/api/admin/team`, {
  method: "POST", headers: { origin: from, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", ""); vi.stubEnv("RESEND_API_KEY", "");
  mocks.getUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "admin_list_team" ? [] : [candidate], error: null }));
});
afterEach(() => vi.unstubAllEnvs());

describe("existing account team access preparation", () => {
  it("requires the SQL team-manager/MFA gate before any lookup", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await POST(request({ action: "lookup", email }))).status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_list_team");
  });
  it("rejects an unrelated origin before authenticating", async () => {
    expect((await POST(request({ action: "lookup", email }, "https://other.example"))).status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("returns only the exact active account and minimal fields without secrets or email delivery", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "admin_list_team" ? [] : [
      { ...candidate, phone: "private phone", bookings_count: 50 },
      { ...candidate, user_id: actorId, email: "other@example.test" },
    ], error: null }));
    const result = await POST(request({ action: "lookup", email: email.toUpperCase() }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ candidate: { userId: candidateId, email, displayName: "QA operator" } });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_list_users", { search_term: email.toUpperCase() });
    expect(mocks.rpc).not.toHaveBeenCalledWith("admin_assign_role", expect.anything());
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each([
    [], [{ ...candidate, is_suspended: true }], [{ ...candidate, user_id: actorId }],
    [{ ...candidate, email: "other@example.test" }], [candidate, candidate],
  ].map(rows => ({ rows })))("refuses absent, suspended, self, inexact or ambiguous matches", async ({ rows }) => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "admin_list_team" ? [] : rows, error: null }));
    expect((await POST(request({ action: "lookup", email }))).status).toBe(404);
  });
  it("refuses malformed database results safely", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "admin_list_team" ? [] : [{ email }], error: null }));
    expect((await POST(request({ action: "lookup", email }))).status).toBe(503);
  });
  it("keeps actual role assignment on the existing audited RPC and its independent MFA gate", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "admin_list_team" ? [] : true, error: null }));
    const result = await POST(request({ action: "role", userId: candidateId, role: "super_admin", reason: "QA authorized assignment" }));
    expect(result.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_assign_role", {
      target_user_id: candidateId, target_role_key: "super_admin", reason: "QA authorized assignment",
    });
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
