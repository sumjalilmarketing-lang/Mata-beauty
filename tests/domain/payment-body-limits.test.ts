import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), rpc: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({
  authenticatedSupabase: mocks.auth,
  consumeRateLimit: mocks.rate,
  hasTrustedOrigin: () => true,
  requestContext: () => ({ requestId: "test", ipHash: "test" }),
  applicationOrigin: () => "https://mata-beauty.com",
  requestFingerprint: () => "test",
  serviceSupabase: vi.fn(),
  jsonError: (message: string, status: number, code: string) => Response.json({ error: { code, message } }, { status }),
}));
import { POST as create } from "../../app/api/payments/create/route";
import { POST as refund } from "../../app/api/payments/refund/route";
import { POST as confirm } from "../../app/api/payments/confirm-service/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "test" }, client: { rpc: mocks.rpc } });
  mocks.rate.mockResolvedValue(true);
});

describe.each([["create", create], ["refund", refund], ["confirm-service", confirm]] as const)("payment %s body validation", (name, handler) => {
  it("rejects an oversized streamed body even when content-length is forged", async () => {
    const request = new Request(`https://mata-beauty.com/api/payments/${name}`, { method: "POST", headers: { "content-length": "1" }, body: JSON.stringify({ note: "x".repeat(20_000) }) });
    const response = await handler(request);
    expect(response.status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports malformed JSON and unexpected keys without a financial operation", async () => {
    const invalid = new Request(`https://mata-beauty.com/api/payments/${name}`, { method: "POST", body: "{" });
    expect((await handler(invalid)).status).toBe(400);
    const body = name === "create" ? { bookingId: "11111111-1111-4111-8111-111111111111", method: "wave", attempt: "12345678", amount: 1 }
      : name === "refund" ? { paymentId: "11111111-1111-4111-8111-111111111111", amount: 1, reason: "test refund", attempt: "12345678", customerId: "other" }
      : { bookingId: "11111111-1111-4111-8111-111111111111", customerId: "other" };
    expect((await handler(new Request(`https://mata-beauty.com/api/payments/${name}`, { method: "POST", body: JSON.stringify(body) }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
