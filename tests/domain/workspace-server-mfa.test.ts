import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), profile: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string): never => {
    mocks.redirect(path);
    throw new Error(`redirect:${path}`);
  },
  notFound: (): never => { throw new Error("notFound"); },
}));
vi.mock("@/lib/auth/profile", () => ({ ensureAuthenticatedProfile: mocks.profile }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabasePageClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "verified-user", email: "fixture@example.test" } } }) },
    rpc: mocks.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => table === "businesses" ? Promise.resolve({ count: 0, error: null }) : query,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  }),
}));
import { requireWorkspace } from "@/lib/auth/workspace-server";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED", "false");
  mocks.profile.mockResolvedValue({ roles: ["admin"] });
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "admin_mfa_required"
    ? false : { roles: ["super_admin"], permissions: [] } }));
});
afterEach(() => vi.unstubAllEnvs());

describe("workspace page MFA gate", () => {
  it.each([null, undefined, "false", 0, {}, []])("denies an internal page when MFA cannot be verified: %j", async invalid => {
    const implementation = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name: string) => name === "admin_mfa_required"
      ? Promise.resolve({ data: invalid, error: null }) : implementation(name));
    await expect(requireWorkspace("admin", "dashboard")).rejects.toThrow("redirect:/?auth_error=workspace_unavailable");
    expect(mocks.redirect).toHaveBeenCalledOnce();
  });

  it("denies an internal page on MFA database error, even with false data", async () => {
    const implementation = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name: string) => name === "admin_mfa_required"
      ? Promise.resolve({ data: false, error: { message: "offline" } }) : implementation(name));
    await expect(requireWorkspace("admin", "dashboard")).rejects.toThrow("redirect:/?auth_error=workspace_unavailable");
  });

  it("requires the second-factor screen when MFA is required", async () => {
    const implementation = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name: string) => name === "admin_mfa_required"
      ? Promise.resolve({ data: true, error: null }) : implementation(name));
    await expect(requireWorkspace("admin", "dashboard")).rejects.toThrow("redirect:/admin");
  });

  it("allows a verified false MFA requirement with a database-authorized role", async () => {
    const context = await requireWorkspace("admin", "dashboard");
    expect(context.identity.adminRoles).toEqual(["super_admin"]);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
