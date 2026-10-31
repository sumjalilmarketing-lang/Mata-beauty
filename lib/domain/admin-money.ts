/** Amounts use the same major-unit convention as booking and provider prices. */
export function formatAdminMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency.trim(), currencyDisplay: "code" }).format(amount);
}

/** Never add amounts belonging to different currencies without an FX conversion. */
export function formatRecordedMoney(value: unknown, currency: unknown) {
  if (value === null || value === undefined || value === "") return "Montant non renseigné";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "Montant non renseigné";
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency.trim())) return "Devise non renseignée";
  return formatAdminMoney(amount, currency);
}

export function totalAdminMoneyByCurrency(rows: ReadonlyArray<{ amount: number; currency: string }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency.trim();
    totals.set(currency, (totals.get(currency) ?? 0) + row.amount);
  }
  return [...totals].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount }));
}

export function formatCurrencyBreakdown(rows: ReadonlyArray<{ currency: string; amount: number }> | null | undefined) {
  if (rows === undefined) return "Détail par devise indisponible";
  if (rows === null) return "Accès financier restreint";
  return rows.map(row => formatRecordedMoney(row.amount, row.currency)).join(" · ") || "Aucun montant enregistré";
}
