/** The public feed does not expose the provider's time zone. Cover every
 * possible local today (UTC-12 through UTC+14) and its next 13 days.
 * The availability RPC interprets dates in the provider's zone, excludes past
 * instants and orders results; the extra calendar days cannot offer past slots.
 */
export function feedAvailabilityWindow(now: Date): { from_date: string; days: number } {
  const previousUtcDay = new Date(now);
  previousUtcDay.setUTCDate(previousUtcDay.getUTCDate() - 1);
  return { from_date: previousUtcDay.toISOString().slice(0, 10), days: 16 };
}
