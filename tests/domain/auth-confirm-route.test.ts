import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn(), getUser: vi.fn(), rpc: vi.fn(),
  signOut: vi.fn(), service: vi.fn(), welcome: vi.fn(),
}));
vi.mock("../../lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({
  auth: { verifyOtp: mocks.verifyOtp, exchangeCodeForSession: mocks.exchangeCodeForSession, getUser: mocks.getUser, signOut: mocks.signOut }, rpc: mocks.rpc,
}) }));
vi.mock("../../lib/payments/server", () => ({
  applicationOrigin: (request: Request) => new URL(request.url).origin,
  serviceSupabase: mocks.service,
}));
vi.mock("../../lib/email/welcome", () => ({ sendWelcomeEmail: mocks.welcome }));
import { GET } from "../../app/auth/confirm/route";

const origin = "https://mata-beauty-git-test-africrm.vercel.app";

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: { is_suspended: false }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("email confirmation route", () => {
  it.each(["email", "signup"])("verifies a %s confirmation before opening the profile", async (type) => {
    const result = await GET(new Request(`${origin}/auth/confirm?type=${type}&token_hash=test-hash`));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type, token_hash: "test-hash" });
    expect(result.headers.get("location")).toBe(`${origin}/app/profile?auth=email_confirmed`);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.rpc).toHaveBeenCalledWith("synchronize_account_status");
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(["email_change", "sms", "unknown"])("refuses an unsupported %s token without session or profile access", async (type) => {
    const result = await GET(new Request(`${origin}/auth/confirm?type=${type}&token_hash=test-hash`));
    expect(result.headers.get("location")).toContain("auth_error=email_link_invalid");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not accept an expired email confirmation", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const result = await GET(new Request(`${origin}/auth/confirm?type=email&token_hash=expired`));
    expect(result.headers.get("location")).toContain("auth_error=email_link_invalid");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.welcome).not.toHaveBeenCalled();
  });
  it("lets an ordinary invite reach password setup without an administrative key", async () => {
    const result = await GET(new Request(`${origin}/auth/confirm?type=invite&token_hash=test-hash`));
    expect(result.headers.get("location")).toBe(`${origin}/auth/update-password?mode=invite`);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "test-hash" });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.welcome).not.toHaveBeenCalled();
  });
  it("keeps the internal activation path when the server identifies a pending invitation", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    const lookup = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "invitation" }, error: null }) };
    mocks.service.mockReturnValue({ from: vi.fn().mockReturnValue(lookup) });
    const result = await GET(new Request(`${origin}/auth/confirm?type=invite&token_hash=test-hash`));
    expect(result.headers.get("location")).toBe(`${origin}/auth/update-password?mode=invite&team=1`);
    expect(lookup.eq).toHaveBeenCalledWith("user_id", "verified-user");
  });
  it("refuses an invalid token before profile access or invitation lookup", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const result = await GET(new Request(`${origin}/auth/confirm?type=invite&token_hash=expired`));
    expect(result.headers.get("location")).toContain("auth_error=email_link_invalid");
    expect(mocks.getUser).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.service).not.toHaveBeenCalled();
  });
  it("signs out a suspended account before password setup", async () => {
    mocks.rpc.mockResolvedValue({ data: { is_suspended: true }, error: null });
    const result = await GET(new Request(`${origin}/auth/confirm?type=recovery&token_hash=test-hash`));
    expect(result.headers.get("location")).toContain("auth_error=profile_creation_failed");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
