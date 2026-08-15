export const PAYMENT_STATUSES = [
  "pending", "authorized", "paid", "held", "available", "payout_pending",
  "paid_out", "refunded", "partially_refunded", "failed", "cancelled", "disputed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMode = "full" | "deposit" | "free";
export type PaymentMethod = "orange_money" | "wave" | "card";

export function isTrustedSandboxCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "app.paydunya.com"
      && url.pathname.startsWith("/sandbox-checkout/invoice/");
  } catch {
    return false;
  }
}

export type CommissionRule = Readonly<{
  percentageBasisPoints: number;
  fixedAmount: number;
}>;

export type PaymentQuote = Readonly<{
  currency: "XOF";
  grossAmount: number;
  payableAmount: number;
  remainingAmount: number;
  platformFee: number;
  providerFee: number;
  professionalNetAmount: number;
}>;

function assertMinorUnits(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} doit être un entier positif.`);
}

export function calculatePaymentQuote(input: {
  grossAmount: number;
  mode: PaymentMode;
  depositBasisPoints?: number;
  commission: CommissionRule;
  providerFee?: number;
}): PaymentQuote {
  assertMinorUnits(input.grossAmount, "Le montant brut");
  assertMinorUnits(input.commission.fixedAmount, "La commission fixe");
  const providerFee = input.providerFee ?? 0;
  assertMinorUnits(providerFee, "Les frais prestataire");
  if (!Number.isInteger(input.commission.percentageBasisPoints) || input.commission.percentageBasisPoints < 0 || input.commission.percentageBasisPoints > 10_000) {
    throw new Error("Le taux de commission doit être compris entre 0 et 10 000 points de base.");
  }
  const depositBasisPoints = input.depositBasisPoints ?? 0;
  if (!Number.isInteger(depositBasisPoints) || depositBasisPoints < 0 || depositBasisPoints > 10_000) {
    throw new Error("Le taux d’acompte doit être compris entre 0 et 10 000 points de base.");
  }
  const payableAmount = input.mode === "free" ? 0 : input.mode === "full"
    ? input.grossAmount
    : Math.ceil(input.grossAmount * depositBasisPoints / 10_000);
  const percentageFee = Math.round(payableAmount * input.commission.percentageBasisPoints / 10_000);
  const platformFee = Math.min(payableAmount, percentageFee + input.commission.fixedAmount);
  return {
    currency: "XOF",
    grossAmount: input.grossAmount,
    payableAmount,
    remainingAmount: input.grossAmount - payableAmount,
    platformFee,
    providerFee,
    professionalNetAmount: Math.max(0, payableAmount - platformFee - providerFee),
  };
}

const transitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  pending: ["authorized", "paid", "failed", "cancelled"],
  authorized: ["paid", "failed", "cancelled"],
  paid: ["held", "refunded", "partially_refunded", "disputed"],
  held: ["available", "refunded", "partially_refunded", "disputed"],
  available: ["payout_pending", "refunded", "partially_refunded", "disputed"],
  payout_pending: ["paid_out", "available", "disputed"],
  paid_out: ["disputed"],
  partially_refunded: ["refunded", "disputed"],
  refunded: [], failed: [], cancelled: [], disputed: ["refunded", "partially_refunded"],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) {
  return transitions[from].includes(to);
}

export function makeIdempotencyKey(input: { userId: string; bookingId: string; amount: number; attempt: string }) {
  return `${input.userId}:${input.bookingId}:${input.amount}:${input.attempt}`;
}
