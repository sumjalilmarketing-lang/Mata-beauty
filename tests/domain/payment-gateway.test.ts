import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockPaymentGateway, PayDunyaSandboxGateway, paymentCapabilities } from "../../lib/payments/gateway";

afterEach(() => vi.unstubAllGlobals());

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

describe("public payment capabilities", () => {
  it("fails closed when the PSP mode or one credential is missing", () => {
    expect(paymentCapabilities({ PAYMENT_PROVIDER_MODE: "mock" }).onlineCheckoutEnabled).toBe(false);
    expect(paymentCapabilities({ PAYMENT_PROVIDER_MODE: "paydunya_sandbox", PAYDUNYA_MASTER_KEY: "master", PAYDUNYA_PRIVATE_KEY: "private" }).onlineCheckoutEnabled).toBe(false);
  });

  it("exposes only sandbox methods when all server credentials exist", () => {
    expect(paymentCapabilities({
      PAYMENT_PROVIDER_MODE: "paydunya_sandbox", PAYDUNYA_MASTER_KEY: "master",
      PAYDUNYA_PRIVATE_KEY: "private", PAYDUNYA_TOKEN: "token",
    })).toEqual({
      onlineCheckoutEnabled: true, environment: "sandbox", provider: "paydunya",
      methods: ["orange_money", "wave", "card"],
    });
  });
});

describe("PayDunya sandbox gateway", () => {
  const credentials = { masterKey: "master-test", privateKey: "private-test", token: "token-test" };
  const request = {
    reference: "MB-1", amount: 5000, currency: "XOF" as const, description: "Test", method: "wave" as const,
    successUrl: "https://example.test/success", cancelUrl: "https://example.test/cancel", webhookUrl: "https://example.test/webhook",
  };

  it("creates only a pending sandbox checkout and keeps credentials in headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response_code: "00", response_text: "https://app.paydunya.com/sandbox-checkout/invoice/test_invoice_1", token: "test_invoice_1",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new PayDunyaSandboxGateway(credentials).createCheckout(request);
    expect(result).toMatchObject({ provider: "paydunya", providerReference: "test_invoice_1", status: "pending", isTest: true });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ "PAYDUNYA-PRIVATE-KEY": "private-test" });
    expect(JSON.stringify(init.body)).not.toContain("private-test");
    expect(new PayDunyaSandboxGateway(credentials).checkoutUrlForReference("test_invoice_1"))
      .toBe("https://app.paydunya.com/sandbox-checkout/invoice/test_invoice_1");
  });

  it("rejects a checkout URL outside the PayDunya sandbox host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response_code: "00", response_text: "https://evil.example/checkout/test_invoice_1", token: "test_invoice_1",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(new PayDunyaSandboxGateway(credentials).createCheckout(request)).rejects.toThrow("Réponse PayDunya invalide");
  });

  it("authenticates and confirms status server-to-server", async () => {
    const hash = createHash("sha512").update(credentials.masterKey).digest("hex");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hash, invoice: { token: "test_invoice_1", total_amount: 5000 }, status: "completed",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const gateway = new PayDunyaSandboxGateway(credentials);
    await expect(gateway.confirmTransaction("test_invoice_1")).resolves.toEqual({
      providerReference: "test_invoice_1", status: "paid", amount: 5000, currency: "XOF",
    });
    expect(gateway.verifyWebhook("ignored", hash)).toBe(true);
    expect(gateway.verifyWebhook("ignored", "0".repeat(128))).toBe(false);
  });

  it("fails closed when the PSP is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network lost")));
    await expect(new PayDunyaSandboxGateway(credentials).createCheckout(request)).rejects.toThrow("network lost");
  });
});
