import { describe, expect, it } from "vitest";
import { internationalPhone, splitPhone, isInternationalPhone, PHONE_COUNTRIES } from "../../lib/domain/phone-number";

describe("country calling codes",()=>{
  it("formats national numbers for the selected country",()=>{
    expect(internationalPhone("77 735 73 01","SN")).toBe("+221777357301");
    expect(internationalPhone("06 12 34 56 78","FR")).toBe("+33612345678");
    expect(internationalPhone("02 12345678","IT")).toBe("+390212345678");
    expect(internationalPhone("1 202 555 0100","US")).toBe("+12025550100");
  });
  it("handles pasted international numbers and shared prefixes without duplication",()=>{
    expect(splitPhone("0033 6 12 34 56 78","SN")).toEqual({country:"FR",number:"612345678"});
    expect(splitPhone("+1 416 555 0100","CA").country).toBe("CA");
    expect(internationalPhone("+254712345678","SN")).toBe("+254712345678");
  });
  it("supports every market and rejects malformed E.164 numbers",()=>{
    expect(PHONE_COUNTRIES.every(country=>/^\d{1,3}$/.test(country.dial))).toBe(true);
    expect(internationalPhone("","SN")).toBe("");
    expect(isInternationalPhone("+221777357301")).toBe(true);
    for(const value of ["+221abc12345","+2211","+1234567890123456"]) expect(isInternationalPhone(value)).toBe(false);
  });
});
