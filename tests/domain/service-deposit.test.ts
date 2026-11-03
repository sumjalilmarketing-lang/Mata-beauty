import { describe, it, expect } from "vitest";
import { serviceDepositQuote, validDepositPercentage } from "@/lib/domain/service-deposit";
describe("planned service deposits", () => {
  it.each([0,20,30,60])("accepts rate %s", rate => expect(validDepositPercentage(rate)).toBe(true));
  it.each([-1,61,30.5,NaN,Infinity])("rejects rate %s", rate => expect(() => serviceDepositQuote(10000,rate)).toThrow(RangeError));
  it("splits a long XOF service at 60% without changing the total", () => expect(serviceDepositQuote(10000,60)).toEqual({totalAmount:10000,percentage:60,depositAmount:6000,balanceAmount:4000}));
  it("keeps zero deposits and free services valid", () => {expect(serviceDepositQuote(10000,0).balanceAmount).toBe(10000); expect(serviceDepositQuote(0,60).depositAmount).toBe(0);});
  it("rounds XOF to whole francs", () => expect(serviceDepositQuote(101,30)).toMatchObject({depositAmount:30,balanceAmount:71}));
  it.each(["EUR","USD","GBP","CAD"] as const)("preserves cents for %s", currency => expect(serviceDepositQuote(35,30,currency)).toMatchObject({depositAmount:10.5,balanceAmount:24.5}));
  it.each([-1,1.5,Infinity,Number.MAX_SAFE_INTEGER])("rejects invalid or unsafe total %s", total => expect(() => serviceDepositQuote(total,60)).toThrow(RangeError));
});
