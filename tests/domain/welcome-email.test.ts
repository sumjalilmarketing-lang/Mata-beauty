import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendWelcomeEmail } from "../../lib/email/welcome";

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({ serviceSupabase: () => db }));
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  db.rpc.mockResolvedValue({ data: [{ recipient: "verified@example.test" }], error: null });
  db.from.mockReturnValue({ update: db.update }); db.update.mockReturnValue({ eq: db.eq }); db.eq.mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("welcome delivery", () => {
  it("does not consume a claim when email is unconfigured", async () => {
    vi.stubEnv("RESEND_API_KEY", ""); expect(await sendWelcomeEmail("account")).toBe("unconfigured"); expect(db.rpc).not.toHaveBeenCalled();
  });
  it("does not send for old, already sent, or concurrently claimed accounts", async () => {
    db.rpc.mockResolvedValue({ data: [], error: null }); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await sendWelcomeEmail("account")).toBe("skipped"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses only the claimed address and persists the Resend receipt", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "message-123" })); vi.stubGlobal("fetch", fetcher);
    expect(await sendWelcomeEmail("account")).toBe("sent");
    const options = fetcher.mock.calls[0][1];
    expect(JSON.parse(options.body).to).toEqual(["verified@example.test"]);
    expect(options.headers["Idempotency-Key"]).toBe("welcome-v1-account");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: "sent", provider_message_id: "message-123" }));
  });
  it("keeps an unsuccessful or ambiguous send retryable without a false receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 })));
    await expect(sendWelcomeEmail("account")).rejects.toThrow("welcome_send_failed"); expect(db.update).not.toHaveBeenCalled();
  });
});
