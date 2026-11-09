import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("../../lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({
  auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
}) }));
vi.mock("../../lib/payments/server", () => ({ applicationOrigin: (request: Request) => new URL(request.url).origin }));
import { GET } from "../../app/auth/workspace/route";

const origin = "https://mata-beauty.com";
let role: string;
let roles: string[];
let mfa: boolean;
let suspended: boolean;
beforeEach(() => {
  vi.resetAllMocks(); role = "admin"; roles = ["commercial_manager"]; mfa = false; suspended = false;
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-henri", user_metadata: { role: "super_admin" } } }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data:
    name === "get_my_private_profile" ? { role, is_suspended: suspended, account_status: "active" }
      : name === "admin_mfa_required" ? mfa : { roles },
  }));
});
const open = () => GET(new Request(`${origin}/auth/workspace?role=super_admin&next=https://evil.example`));
describe("verified workspace entry", () => {
  it.each([
    ["commercial_manager", "/commercial"], ["commercial_agent", "/commercial"],
    ["finance_manager", "/finance"], ["support_manager", "/support-agent"], ["super_admin", "/admin"],
  ])("routes %s by the database role, ignoring URL and editable metadata", async (assigned, path) => {
    roles = [assigned]; const response = await open();
    expect(response.headers.get("location")).toBe(origin + path);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("admin_mfa_required");
  });
  it("requires sign-in and preserves the workspace entry after it", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await open()).headers.get("location")).toBe(`${origin}/?connexion=requise&returnTo=%2Fauth%2Fworkspace`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires MFA before reading the privileged context", async () => {
    mfa = true;
    expect((await open()).headers.get("location")).toBe(`${origin}/admin`);
    expect(mocks.rpc).not.toHaveBeenCalledWith("get_admin_context");
  });
  it("does not route a suspended account into its former department", async () => {
    suspended = true;
    expect((await open()).headers.get("location")).toContain("auth_error=account_suspended");
    expect(mocks.rpc).not.toHaveBeenCalledWith("get_admin_context");
  });
  it("denies a revoked or unknown internal role", async () => {
    roles = [];
    expect((await open()).headers.get("location")).toBe(`${origin}/?acces=refuse`);
  });
  it("preserves ordinary clients without internal role lookup", async () => {
    role = "client";
    expect((await open()).headers.get("location")).toBe(`${origin}/app/profile`);
    expect(mocks.rpc).not.toHaveBeenCalledWith("get_admin_context");
  });
  it("fails closed when the database cannot verify the workspace", async () => {
    mocks.rpc.mockRejectedValue(new Error("offline"));
    expect((await open()).headers.get("location")).toContain("auth_error=workspace_unavailable");
  });
  it.each([null, undefined, "false", 0, {}, []])("rejects an unverified MFA response %j", async (invalid) => {
    const implementation = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name: string) => name === "admin_mfa_required"
      ? Promise.resolve({ data: invalid, error: null }) : implementation(name));
    expect((await open()).headers.get("location")).toBe(`${origin}/?auth_error=workspace_unavailable`);
    expect(mocks.rpc).not.toHaveBeenCalledWith("get_admin_context");
  });
  it("rejects an MFA lookup error even when its data says false", async () => {
    const implementation = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name: string) => name === "admin_mfa_required"
      ? Promise.resolve({ data: false, error: { message: "offline" } }) : implementation(name));
    expect((await open()).headers.get("location")).toBe(`${origin}/?auth_error=workspace_unavailable`);
    expect(mocks.rpc).not.toHaveBeenCalledWith("get_admin_context");
  });
});
