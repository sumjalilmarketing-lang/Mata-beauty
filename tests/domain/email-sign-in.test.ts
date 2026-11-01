import { describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { requestEmailSignIn } from "../../lib/auth/email-sign-in";

describe("email sign in", () => {
  it("requests a verified sign-in link for an existing account only", async () => {
    const auth = { signInWithOtp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }) };
    await requestEmailSignIn(auth, "qa@example.com", "https://test.mata.invalid");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "qa@example.com",
      options: { shouldCreateUser: false, emailRedirectTo: "https://test.mata.invalid/auth/confirm" },
    });
  });
  it.each(["otp_disabled", "signups_not_allowed", "user_not_found"])("does not disclose %s responses", async (code) => {
    const auth = { signInWithOtp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: new AuthApiError("private details", 400, code) }) };
    await expect(requestEmailSignIn(auth, "unknown@example.com", "https://test.mata.invalid")).resolves.toBeUndefined();
  });
  it("preserves provider delivery and rate limit failures", async () => {
    const error = new AuthApiError("rate limited", 429, "over_email_send_rate_limit");
    const auth = { signInWithOtp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error }) };
    await expect(requestEmailSignIn(auth, "qa@example.com", "https://test.mata.invalid")).rejects.toBe(error);
  });
});
