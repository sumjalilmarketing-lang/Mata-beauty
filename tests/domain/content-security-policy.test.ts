import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { contentSecurityPolicy, usesWorkspaceNonce } from "@/lib/security/content-security-policy";
import { proxy } from "@/proxy";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
const environment = { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: "public-key" };
const scriptDirective = (policy: string) => policy.split(";").find(item => item.trim().startsWith("script-src")) ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  mocks.create.mockImplementation((_url: string, _key: string, options: { cookies: { setAll: (values: { name: string; value: string; options: { sameSite: "lax" } }[]) => void } }) => ({
    auth: { getUser: async () => { options.cookies.setAll([{ name: "refreshed", value: "session", options: { sameSite: "lax" } }]); return { data: { user: null } }; } },
    rpc: () => ({ abortSignal: async () => ({ error: null, data: { enabled: false } }) }),
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("workspace CSP without changing public static rendering", () => {
  it("requires workspace HTML and never selects static assets, APIs or RSC payloads", () => {
    for (const path of ["/app", "/staff/profile", "/pro", "/salon", "/auth/update-password", "/finance"]) expect(usesWorkspaceNonce(path, "text/html")).toBe(true);
    for (const path of ["/", "/conseils/test", "/api/push", "/staff/manifest.webmanifest", "/professional/salon"]) expect(usesWorkspaceNonce(path, "text/html")).toBe(false);
    expect(usesWorkspaceNonce("/app/profile", "text/x-component")).toBe(false);
  });
  it("removes inline script allowance under a nonce while preserving OCR, media and backend origins", () => {
    const policy = contentSecurityPolicy(environment, "dGVzdC1ub25jZQ==");
    expect(scriptDirective(policy)).toContain("'nonce-dGVzdC1ub25jZQ==' 'strict-dynamic'");
    expect(scriptDirective(policy)).not.toContain("'unsafe-inline'");
    expect(scriptDirective(policy)).not.toContain("'unsafe-eval'");
    expect(policy).toContain("'wasm-unsafe-eval'");
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("https://example.supabase.co");
    expect(policy).toContain("https://www.google.com");
  });
  it("keeps the static compatibility policy and a stricter non-blocking candidate", () => {
    expect(scriptDirective(contentSecurityPolicy(environment))).toContain("'unsafe-inline'");
    expect(contentSecurityPolicy(environment)).toContain("script-src-attr 'none'");
    expect(scriptDirective(contentSecurityPolicy(environment, undefined, true))).not.toContain("'unsafe-inline'");
    expect(() => contentSecurityPolicy(environment, "untrusted;script")).toThrow("Invalid CSP nonce");
  });
  it("forwards the generated nonce to Next and preserves it through session refresh", async () => {
    const request = new NextRequest("https://mata.test/staff/profile", { headers: { accept: "text/html", "x-nonce": "attacker-value", "content-security-policy": "untrusted" } });
    const response = await proxy(request);
    const nonce = response.headers.get("x-middleware-request-x-nonce");
    const policy = response.headers.get("Content-Security-Policy");
    expect(nonce).toBeTruthy(); expect(nonce).not.toBe("attacker-value");
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(response.headers.get("x-middleware-request-cookie")).toContain("refreshed=session");
    expect(response.headers.get("Set-Cookie")).toContain("refreshed=session");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const second = await proxy(new NextRequest("https://mata.test/staff/profile", { headers: { accept: "text/html" } }));
    expect(second.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
  });
  it("does not attach a per-request nonce or change cache headers for public static documents", async () => {
    const response = await proxy(new NextRequest("https://mata.test/", { headers: { accept: "text/html", "x-nonce": "untrusted" } }));
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBeNull();
  });
});
