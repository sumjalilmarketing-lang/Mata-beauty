/** Amounts use the same major-unit convention as booking and provider prices. */
export function formatAdminMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency.trim(), currencyDisplay: "code" }).format(amount);
}

/** Never add amounts belonging to different currencies without an FX conversion. */
export function totalAdminMoneyByCurrency(rows: ReadonlyArray<{ amount: number; currency: string }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency.trim();
    totals.set(currency, (totals.get(currency) ?? 0) + row.amount);
  }
  return [...totals].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount }));
}
