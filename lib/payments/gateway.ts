import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentMethod } from "@/lib/domain/payments";

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
  provider: "mock" | "paytech";
  providerReference: string;
  checkoutUrl: string | null;
  status: "pending";
}>;

export interface PaymentGateway {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}

export class MockPaymentGateway implements PaymentGateway {
  constructor(private readonly webhookSecret: string) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    return { provider: "mock", providerReference: `mock_${request.reference}`, checkoutUrl: null, status: "pending" };
  }

  verifyWebhook(rawBody: string, signature: string | null) {
    if (!this.webhookSecret || !signature) return false;
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    const received = signature.replace(/^sha256=/, "");
    return expected.length === received.length && timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }
}

export function getPaymentGateway(): PaymentGateway {
  const mode = process.env.PAYMENT_PROVIDER_MODE ?? "mock";
  if (mode !== "mock") {
    throw new Error("La passerelle réelle n’est pas activée : validez d’abord le compte marchand et la sandbox PayTech.");
  }
  return new MockPaymentGateway(process.env.PAYMENT_WEBHOOK_SECRET ?? "");
}
