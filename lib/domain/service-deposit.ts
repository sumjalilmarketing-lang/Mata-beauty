import type { BookingCurrency } from "./booking";

export const MAX_DEPOSIT_PERCENTAGE = 60;
export const FREE_CANCELLATION_NOTICE_HOURS = 48;
export function validDepositPercentage(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_DEPOSIT_PERCENTAGE;
}
/** Configuration preview only: never represents a payment or a booking debt. */
export function serviceDepositQuote(totalAmount: number, percentage: number, currency: BookingCurrency = "XOF") {
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0 || !validDepositPercentage(percentage)) throw new RangeError("Invalid deposit quote");
  const scale = currency === "XOF" ? 1 : 100;
  const totalMinor = totalAmount * scale;
  if (!Number.isSafeInteger(totalMinor * 100)) throw new RangeError("Amount too large");
  const depositMinor = Math.round(totalMinor * percentage / 100);
  return { totalAmount, percentage, depositAmount: depositMinor / scale, balanceAmount: (totalMinor - depositMinor) / scale };
}
