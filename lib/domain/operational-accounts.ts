type AccountStatus = { id: string; account_status: string };

/** Retained audit identities are not operational users, even if an older
 * cleanup did not set the newer suspension/archive flags. */
export function operationalAccounts<T extends { user_id: string }>(accounts: readonly T[], statuses: readonly AccountStatus[]): T[] {
  const deleted = new Set(statuses.filter(profile => profile.account_status === "deleted").map(profile => profile.id));
  return accounts.filter(account => !deleted.has(account.user_id));
}
