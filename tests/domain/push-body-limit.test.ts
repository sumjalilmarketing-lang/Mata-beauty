import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST, DELETE } from "@/app/api/push/route";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/payments/server", () => ({ authenticatedSupabase: mocks.auth }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PUSH_VAPID_PUBLIC_KEY", "test"); vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", "test");
  mocks.auth.mockResolvedValue({ user: { id: "own-user" }, client: { rpc: mocks.rpc, from: mocks.from } });
});
afterEach(() => vi.unstubAllEnvs());
function request(method: string, text: string) {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } });
  return new Request("https://mata.test/api/push", { method, headers: { Origin: "https://mata.test" }, body, duplex: "half" } as RequestInit);
}
for (const [method, handler] of [["POST", POST], ["DELETE", DELETE]] as const) {
  it(`${method} bounds chunked input before database operations`, async () => {
    expect((await handler(request(method, JSON.stringify({ padding: "x".repeat(5001) })))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it(`${method} treats malformed JSON as a client error`, async () => {
    expect((await handler(request(method, "{"))).status).toBe(400);
  });
}
it("preserves valid subscription registration", async () => {
  mocks.rpc.mockResolvedValue({ error: null });
  const response = await POST(request("POST", JSON.stringify({ endpoint: "https://web.push.apple.com/device", keys: { auth: "a".repeat(22), p256dh: "b".repeat(87) } })));
  expect(response.status).toBe(200); expect(mocks.rpc).toHaveBeenCalledOnce();
});
