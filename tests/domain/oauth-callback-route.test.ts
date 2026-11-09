import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), rpc: vi.fn(), user: vi.fn(), signOut: vi.fn(), welcome: vi.fn() }));
vi.mock("@/lib/payments/server", () => ({ applicationOrigin: () => "https://mata-beauty.com" }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({
  auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.user, signOut: mocks.signOut }, rpc: mocks.rpc,
}) }));
vi.mock("@/lib/email/welcome", () => ({ sendWelcomeEmail: mocks.welcome }));
import { GET } from "@/app/auth/callback/route";
const request = (query: string) => new Request(`https://mata-beauty.com/auth/callback?${query}`);
const location = (response: Response) => new URL(response.headers.get("location")!);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "synchronize_account_status" ? "active" : { role: "client", profile_incomplete: false } }));
  mocks.user.mockResolvedValue({ data: { user: { id: "fixture-user" } } });
});
it("shows a Google cancellation on the public page and preserves the protected destination", async () => {
  const url = location(await GET(request("error=access_denied&next=%2Fcommercial")));
  expect(url.pathname).toBe("/"); expect(url.searchParams.get("auth_error")).toBe("google_cancelled");
  expect(url.searchParams.get("returnTo")).toBe("/commercial"); expect(url.searchParams.get("connexion")).toBe("requise");
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it("preserves an invitation destination when an expired session needs a new login", async () => {
  mocks.exchange.mockResolvedValue({ error: { message: "expired" } });
  const destination = "/salon/invitation/accept#token=fixture";
  const url = location(await GET(request(`code=expired&next=${encodeURIComponent(destination)}`)));
  expect(url.pathname).toBe("/"); expect(url.searchParams.get("returnTo")).toBe(destination);
  expect(url.searchParams.get("auth_error")).toBe("oauth_exchange_failed");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["/", "/app", "/app/profile"])("routes verified admin logins for %s through department and MFA resolution", async destination => {
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "synchronize_account_status" ? "active" : { role: "admin" } }));
  const response = await GET(request(`code=valid&next=${encodeURIComponent(destination)}`));
  expect(location(response).pathname).toBe("/auth/workspace");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
it("keeps explicit admin department links", async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "synchronize_account_status" ? "active" : { role: "admin" } }));
  expect(location(await GET(request("code=valid&next=%2Ffinance"))).pathname).toBe("/finance");
});
it("does not grant an admin destination based on the requested intent", async () => {
  expect(location(await GET(request("code=valid&intent=admin&next=%2Fapp"))).pathname).toBe("/app");
});
it("keeps successful invitation deep links", async () => {
  const destination = "/salon/invitation/accept#token=fixture";
  const url = location(await GET(request(`code=valid&next=${encodeURIComponent(destination)}`)));
  expect(url.pathname).toBe("/salon/invitation/accept"); expect(url.hash).toBe("#token=fixture");
});
it("does not redirect suspended admins into an internal space", async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "synchronize_account_status" ? "suspended" : { role: "admin", is_suspended: true } }));
  const url = location(await GET(request("code=valid&next=%2Fcommercial")));
  expect(url.pathname).toBe("/"); expect(url.searchParams.get("auth_error")).toBe("account_suspended");
  expect(mocks.signOut).toHaveBeenCalledOnce();
});
it("rejects external next destinations on errors", async () => {
  const url = location(await GET(request("error=access_denied&next=https%3A%2F%2Fevil.example")));
  expect(url.origin).toBe("https://mata-beauty.com"); expect(url.searchParams.has("returnTo")).toBe(false);
});
it("keeps a valid login successful when the welcome email fails", async () => {
  mocks.welcome.mockRejectedValue(new Error("mail unavailable"));
  const response = await GET(request("code=valid&next=%2Fapp"));
  expect(location(response).pathname).toBe("/app"); expect(location(response).searchParams.get("auth")).toBe("google");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it.each(["disabled", "deleted", "suspended", "email_unverified", "phone_unverified", null, { status: "active" }])("refuses non-active synchronized status %j before professional upgrade or email", async status => {
  const implementation = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name: string) => name === "synchronize_account_status" ? Promise.resolve({ data: status, error: null }) : implementation(name));
  expect(location(await GET(request("code=valid&intent=professional"))).searchParams.get("auth_error")).toBe("account_suspended");
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mocks.rpc).not.toHaveBeenCalledWith("request_professional_profile");
  expect(mocks.welcome).not.toHaveBeenCalled();
});
it("refuses an Auth verification error even if it includes a user", async () => {
  mocks.user.mockResolvedValue({ data: { user: { id: "fixture-user" } }, error: { message: "offline" } });
  expect(location(await GET(request("code=valid"))).searchParams.get("auth_error")).toBe("oauth_exchange_failed");
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("clears the local OAuth session if account synchronization fails", async () => {
  const implementation = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name: string) => name === "synchronize_account_status" ? Promise.resolve({ data: "active", error: { message: "offline" } }) : implementation(name));
  expect(location(await GET(request("code=valid"))).searchParams.get("auth_error")).toBe("profile_creation_failed");
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mocks.welcome).not.toHaveBeenCalled();
});
