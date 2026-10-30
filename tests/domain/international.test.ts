import { describe, expect, it } from "vitest";
import { SUPPORTED_COUNTRIES, SUPPORTED_CURRENCIES, SUPPORTED_LANGUAGES, SUPPORTED_TIME_ZONES } from "../../lib/domain/international";

describe("international market configuration", () => {
  it("offers the requested markets without assigning a fictional location", () => {
    const countryCodes = SUPPORTED_COUNTRIES.map(country => country.code);
    expect(countryCodes).toEqual(expect.arrayContaining(["SN", "FR", "US", "BE", "ES"]));
    expect(new Set(countryCodes).size).toBe(countryCodes.length);
    for (const country of SUPPORTED_COUNTRIES) expect(country.code).toMatch(/^[A-Z]{2}$/);
  });

  it("uses only supported currencies, language choices, and valid IANA time zones", () => {
    expect(SUPPORTED_CURRENCIES).toEqual(["XOF", "EUR", "USD", "GBP", "CAD"]);
    expect(SUPPORTED_LANGUAGES.map(language => language.code)).toContain("es");
    for (const timeZone of SUPPORTED_TIME_ZONES) {
      expect(new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone).toBe(timeZone);
    }
  });
});
