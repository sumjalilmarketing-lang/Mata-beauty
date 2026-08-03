import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MockPaymentGateway } from "../../lib/payments/gateway";

describe("mock gateway", () => {
  it("never fabricates a successful payment", async () => {
    const gateway = new MockPaymentGateway("secret");
    const session = await gateway.createCheckout({
      reference: "MB-1", amount: 5000, currency: "XOF", description: "Test", method: "wave",
      successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel", webhookUrl: "https://example.test/webhook",
    });
    expect(session.status).toBe("pending");
    expect(session.checkoutUrl).toBeNull();
  });

  it("checks webhook signatures without accepting missing values", () => {
    const body = JSON.stringify({ eventId: "evt-1" });
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    const gateway = new MockPaymentGateway("secret");
    expect(gateway.verifyWebhook(body, signature)).toBe(true);
    expect(gateway.verifyWebhook(body, "bad")).toBe(false);
    expect(gateway.verifyWebhook(body, null)).toBe(false);
  });
});
