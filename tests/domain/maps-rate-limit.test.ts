import { afterEach, expect, it, vi } from "vitest";
import { limitMapsRequest } from "@/lib/maps-rate-limit";
import { GET } from "@/app/api/maps/autocomplete/route";

const mocks = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/lib/payments/server", () => ({
  consumeRateLimit: mocks.consume,
  jsonError: (message: string, status: number, code: string) => Response.json({ error: { message, code } }, { status }),
}));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("allows public requests only after both shared quotas pass", async () => {
  mocks.consume.mockResolvedValue(true);
  expect(await limitMapsRequest(new Request("https://mata.test", { headers: { "x-forwarded-for": "192.0.2.1, 192.0.2.2" } }))).toBeNull();
  expect(mocks.consume).toHaveBeenNthCalledWith(1, { scope: "maps_ip", key: "192.0.2.1", limit: 60, windowSeconds: 60 });
  expect(mocks.consume).toHaveBeenNthCalledWith(2, { scope: "maps_global", key: "all", limit: 600, windowSeconds: 60 });
});
it("rejects an exhausted quota before calling Google", async () => {
  vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
  mocks.consume.mockResolvedValue(false);
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const response = await GET(new Request("https://mata.test/api/maps/autocomplete?input=Paris"));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(fetch).not.toHaveBeenCalled();
});
it("enforces the global budget independently of the IP allowance", async () => {
  mocks.consume.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await limitMapsRequest(new Request("https://mata.test")))?.status).toBe(429);
});
it("does not allow a paid request when the durable limiter is unavailable", async () => {
  mocks.consume.mockRejectedValue(new Error("database unavailable"));
  expect((await limitMapsRequest(new Request("https://mata.test")))?.status).toBe(503);
});
it("reports missing production limiter configuration as unavailable, not a user quota error", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PAYMENT_SECURITY_PEPPER", "");
  vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "");
  expect((await limitMapsRequest(new Request("https://mata.test")))?.status).toBe(503);
  expect(mocks.consume).not.toHaveBeenCalled();
});
