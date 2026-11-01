export function isWebhookFresh(occurredAt: Date, now = new Date(), toleranceMs = 5 * 60_000) {
  const value = occurredAt.getTime();
  return Number.isFinite(value) && Math.abs(now.getTime() - value) <= toleranceMs;
}

export function isConsistentFinancialEvent(expected: { amount: number; currency: string; reference: string }, received: { amount: number; currency: string; reference: string }) {
  return Number.isSafeInteger(received.amount) && received.amount >= 0
    && expected.amount === received.amount && expected.currency === received.currency && expected.reference === received.reference;
}
