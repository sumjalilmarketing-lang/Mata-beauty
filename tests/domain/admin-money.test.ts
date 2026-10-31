import { describe, expect, it } from "vitest";
import { formatAdminMoney, formatCurrencyBreakdown, formatRecordedMoney, totalAdminMoneyByCurrency } from "../../lib/domain/admin-money";

describe("international administrative money", () => {
  it("distinguishes an unavailable migration, restricted financial scope and an empty ledger", () => {
    expect(formatCurrencyBreakdown(undefined)).toBe("Détail par devise indisponible");
    expect(formatCurrencyBreakdown(null)).toBe("Accès financier restreint");
    expect(formatCurrencyBreakdown([])).toBe("Aucun montant enregistré");
    const totals = formatCurrencyBreakdown([{currency: "EUR", amount: 25}, {currency: "USD", amount: 50}]);
    expect(totals).toContain("EUR"); expect(totals).toContain("USD"); expect(totals).not.toContain("75");
  });
  it("does not invent a currency or turn absent amounts into zero", () => {
    expect(formatRecordedMoney(20, null)).toBe("Devise non renseignée");
    expect(formatRecordedMoney(20, "invalid")).toBe("Devise non renseignée");
    expect(formatRecordedMoney(null, "EUR")).toBe("Montant non renseigné");
    expect(formatRecordedMoney("NaN", "USD")).toBe("Montant non renseigné");
    expect(formatRecordedMoney("0", "EUR")).toContain("0,00");
    expect(formatRecordedMoney("20", "USD ")).toContain("USD");
  });
  it("preserves Paris and New York currencies and decimal amounts", () => {
    expect(formatAdminMoney(45.5, "EUR")).toContain("45,50");
    expect(formatAdminMoney(45.5, "EUR")).toContain("EUR");
    expect(formatAdminMoney(65, "USD")).toContain("USD");
    expect(formatAdminMoney(5000, "XOF")).not.toContain(",00");
  });
  it("keeps commission totals separated by currency, including padded SQL char values", () => {
    expect(totalAdminMoneyByCurrency([{amount: 10, currency: "EUR "}, {amount: 20, currency: "USD"}, {amount: 5, currency: "EUR"}])).toEqual([{currency: "EUR", amount: 15}, {currency: "USD", amount: 20}]);
    expect(totalAdminMoneyByCurrency([])).toEqual([]);
  });
});
