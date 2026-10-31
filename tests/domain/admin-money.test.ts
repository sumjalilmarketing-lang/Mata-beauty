import { describe, expect, it } from "vitest";
import { formatAdminMoney, totalAdminMoneyByCurrency } from "../../lib/domain/admin-money";

describe("international administrative money", () => {
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
