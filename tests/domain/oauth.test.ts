import { describe, expect, it } from "vitest";
import { normalizeOAuthIntent, oauthErrorCode, safeOAuthDestination } from "../../lib/auth/redirect";
import { isGoogleAuthEnabled } from "../../lib/auth/providers";

describe("Google OAuth security", () => {
  it("refuses open redirects", () => {
    expect(safeOAuthDestination("https://evil.example/steal")).toBe("/");
    expect(safeOAuthDestination("//evil.example/steal")).toBe("/");
    expect(safeOAuthDestination("/%2f%2fevil.example")).toBe("/");
    expect(safeOAuthDestination("/")).toBe("/");
  });

  it("never accepts an administrative intent", () => {
    expect(normalizeOAuthIntent("professional")).toBe("professional");
    expect(normalizeOAuthIntent("admin")).toBe("client");
    expect(normalizeOAuthIntent(null)).toBe("client");
  });

  it("normalizes provider cancellation without exposing its description", () => {
    expect(oauthErrorCode("access_denied", "private provider message")).toBe("google_cancelled");
    expect(oauthErrorCode("server_error", "private provider message")).toBe("google_provider_error");
    expect(oauthErrorCode(null, null)).toBeNull();
  });

  it("fails closed when Google is not enabled by Supabase", async () => {
    const enabled = await isGoogleAuthEnabled(async () => new Response(JSON.stringify({ google: true })));
    const disabled = await isGoogleAuthEnabled(async () => new Response(JSON.stringify({ google: false })));
    const unavailable = await isGoogleAuthEnabled(async () => new Response("error", { status: 503 }));
    expect(enabled).toBe(true);
    expect(disabled).toBe(false);
    expect(unavailable).toBe(false);
  });
});
