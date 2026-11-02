import { describe, expect, it } from "vitest";
import { operationalAccounts } from "@/lib/domain/operational-accounts";

describe("operational admin account list", () => {
  it("excludes a deleted identity even when legacy suspension flags say active", () => {
    const account = { user_id: "legacy", is_suspended: false, is_archived: false };
    expect(operationalAccounts([account], [{ id: "legacy", account_status: "deleted" }])).toEqual([]);
  });

  it("keeps active and suspended users regardless of email spelling", () => {
    const active = { user_id: "real", email: "test@example.com" };
    const suspended = { user_id: "suspended" };
    expect(operationalAccounts([active, suspended], [
      { id: "real", account_status: "active" }, { id: "suspended", account_status: "suspended" },
    ])).toEqual([active, suspended]);
  });

  it("does not infer deletion from a missing profile status or mutate input", () => {
    const accounts = Object.freeze([{ user_id: "unknown" }, { user_id: "deleted" }]);
    expect(operationalAccounts(accounts, [{ id: "deleted", account_status: "deleted" }])).toEqual([{ user_id: "unknown" }]);
    expect(accounts).toHaveLength(2);
  });
});
