/** Service amounts are stored in major units; let the currency define its minor units. */
export function formatServiceMoney(amount: number, currency = "XOF", locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
