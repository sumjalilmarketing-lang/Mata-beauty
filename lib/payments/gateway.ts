import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isTrustedSandboxCheckoutUrl, type PaymentMethod, type PaymentStatus } from "../domain/payments";

export type CheckoutRequest = Readonly<{
  reference: string;
  amount: number;
  currency: "XOF";
  description: string;
  method: PaymentMethod;
  successUrl: string;
  cancelUrl: string;
  webhookUrl: string;
}>;

export type CheckoutSession = Readonly<{
  provider: "mock" | "paydunya";
  providerReference: string;
  checkoutUrl: string | null;
  status: "pending";
  isTest: boolean;
}>;

export type GatewayConfirmation = Readonly<{
  providerReference: string;
  status: Extract<PaymentStatus, "pending" | "paid" | "failed" | "cancelled">;
  amount: number;
  currency: "XOF";
}>;

export interface PaymentGateway {
  readonly provider: "mock" | "paydunya";
  readonly isTest: boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  checkoutUrlForReference(providerReference: string): string | null;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  confirmTransaction(providerReference: string): Promise<GatewayConfirmation | null>;
}

export type PublicPaymentCapabilities = Readonly<{
  onlineCheckoutEnabled: boolean;
  environment: "disabled" | "sandbox";
  provider: "none" | "paydunya";
  methods: readonly PaymentMethod[];
}>;

export function paymentCapabilities(environment: Readonly<Record<string, string | undefined>> = process.env): PublicPaymentCapabilities {
  const configured = environment.PAYMENT_PROVIDER_MODE === "paydunya_sandbox"
    && Boolean(environment.PAYDUNYA_MASTER_KEY)
    && Boolean(environment.PAYDUNYA_PRIVATE_KEY)
    && Boolean(environment.PAYDUNYA_TOKEN);
  return configured
    ? { onlineCheckoutEnabled: true, environment: "sandbox", provider: "paydunya", methods: ["orange_money", "wave", "card"] }
    : { onlineCheckoutEnabled: false, environment: "disabled", provider: "none", methods: [] };
}

function constantTimeHexEqual(expected: string, received: string) {
  return expected.length === received.length && timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}

export class MockPaymentGateway implements PaymentGateway {
  readonly provider = "mock" as const;
  readonly isTest = true;
  constructor(private readonly webhookSecret: string) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    return { provider: "mock", providerReference: `mock_${request.reference}`, checkoutUrl: null, status: "pending", isTest: true };
  }

  checkoutUrlForReference() { return null; }

  verifyWebhook(rawBody: string, signature: string | null) {
    if (!this.webhookSecret || !signature) return false;
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    return constantTimeHexEqual(expected, signature.replace(/^sha256=/, ""));
  }

  async confirmTransaction() { return null; }
}

const createResponseSchema = z.object({ response_code: z.literal("00"), response_text: z.url().refine(isTrustedSandboxCheckoutUrl), token: z.string().min(8) });
const confirmResponseSchema = z.object({
  hash: z.string().length(128),
  invoice: z.object({ token: z.string(), total_amount: z.coerce.number().int().nonnegative() }),
  status: z.enum(["pending", "completed", "failed", "cancelled"]),
});

type PayDunyaCredentials = Readonly<{ masterKey: string; privateKey: string; token: string }>;

export class PayDunyaSandboxGateway implements PaymentGateway {
  readonly provider = "paydunya" as const;
  readonly isTest = true;
  private readonly baseUrl = "https://app.paydunya.com/sandbox-api/v1";
  constructor(private readonly credentials: PayDunyaCredentials) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      "PAYDUNYA-MASTER-KEY": this.credentials.masterKey,
      "PAYDUNYA-PRIVATE-KEY": this.credentials.privateKey,
      "PAYDUNYA-TOKEN": this.credentials.token,
    };
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const response = await fetch(`${this.baseUrl}/checkout-invoice/create`, {
      method: "POST",
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        invoice: { total_amount: request.amount, description: request.description },
        store: { name: "Mata Beauty" },
        custom_data: { mata_reference: request.reference, payment_method: request.method },
        actions: { callback_url: request.webhookUrl, return_url: request.successUrl, cancel_url: request.cancelUrl },
      }),
    });
    if (!response.ok) throw new Error(`PayDunya indisponible (${response.status}).`);
    const parsed = createResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Réponse PayDunya invalide.");
    return { provider: "paydunya", providerReference: parsed.data.token, checkoutUrl: parsed.data.response_text, status: "pending", isTest: true };
  }

  checkoutUrlForReference(providerReference: string) {
    return `https://app.paydunya.com/sandbox-checkout/invoice/${encodeURIComponent(providerReference)}`;
  }

  verifyWebhook(_rawBody: string, signature: string | null) {
    if (!signature) return false;
    const expected = createHash("sha512").update(this.credentials.masterKey).digest("hex");
    return constantTimeHexEqual(expected, signature);
  }

  async confirmTransaction(providerReference: string): Promise<GatewayConfirmation> {
    const response = await fetch(`${this.baseUrl}/checkout-invoice/confirm/${encodeURIComponent(providerReference)}`, {
      headers: this.headers(), signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`Confirmation PayDunya indisponible (${response.status}).`);
    const parsed = confirmResponseSchema.safeParse(await response.json());
    if (!parsed.success || !this.verifyWebhook("", parsed.success ? parsed.data.hash : null)) throw new Error("Confirmation PayDunya non authentique.");
    const status = parsed.data.status === "completed" ? "paid" : parsed.data.status;
    return { providerReference: parsed.data.invoice.token, status, amount: parsed.data.invoice.total_amount, currency: "XOF" };
  }
}

export function getPaymentGateway(): PaymentGateway {
  const mode = process.env.PAYMENT_PROVIDER_MODE ?? "mock";
  if (mode === "mock") return new MockPaymentGateway(process.env.PAYMENT_WEBHOOK_SECRET ?? "");
  if (mode === "paydunya_sandbox") {
    const masterKey = process.env.PAYDUNYA_MASTER_KEY;
    const privateKey = process.env.PAYDUNYA_PRIVATE_KEY;
    const token = process.env.PAYDUNYA_TOKEN;
    if (!masterKey || !privateKey || !token) throw new Error("Identifiants PayDunya Sandbox incomplets.");
    return new PayDunyaSandboxGateway({ masterKey, privateKey, token });
  }
  throw new Error("Le paiement de production est bloqué tant que l’homologation marchand et sécurité n’est pas validée.");
}
