import { describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError, createClient } from "@supabase/supabase-js";
import { readPasswordReturn, restorePasswordSession } from "../../lib/auth/password-session";

describe("email password session", () => {
  it("accepts complete invitation/recovery returns without interpreting a role", () => {
    expect(readPasswordReturn(new URL("https://mata-beauty.com/auth/update-password#access_token=access&refresh_token=refresh&type=invite&role=admin")))
      .toEqual({ kind: "tokens", accessToken: "access", refreshToken: "refresh", invitation: true });
    expect(readPasswordReturn(new URL("https://mata-beauty.com/auth/update-password#access_token=a&refresh_token=r&type=recovery")))
      .toMatchObject({ kind: "tokens", invitation: false });
  });
  it("rejects expired, incomplete and wrong-purpose links even with an existing session", () => {
    for (const fragment of ["access_token=a", "access_token=a&refresh_token=r&type=signup", "error_code=otp_expired"]) {
      expect(readPasswordReturn(new URL(`https://mata-beauty.com/auth/update-password#${fragment}`)).kind).toBe("error");
    }
  });
  it("preserves PKCE and already established server sessions", () => {
    expect(readPasswordReturn(new URL("https://mata-beauty.com/auth/update-password?code=abc"))).toEqual({ kind: "code", code: "abc" });
    expect(readPasswordReturn(new URL("https://mata-beauty.com/auth/update-password"))).toEqual({ kind: "session" });
  });
  it("does not accept local state without server validation", async () => {
    const client = createClient("https://example.supabase.co", "test", { auth: { persistSession: false, autoRefreshToken: false } });
    const getUser = vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    await expect(restorePasswordSession(client, { kind: "session" })).rejects.toBeInstanceOf(AuthSessionMissingError);
    expect(getUser).toHaveBeenCalledOnce();
    getUser.mockRestore();
  });
});
