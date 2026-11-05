import { SUPPORTED_COUNTRIES } from "./international";

const callingCodes: Record<(typeof SUPPORTED_COUNTRIES)[number]["code"], string> = {
  SN: "221", CI: "225", ML: "223", BF: "226", BJ: "229", TG: "228", NE: "227",
  FR: "33", BE: "32", ES: "34", DE: "49", IT: "39", NL: "31", PT: "351",
  IE: "353", LU: "352", US: "1", GB: "44", CA: "1",
};
export const PHONE_COUNTRIES = SUPPORTED_COUNTRIES.map(country => ({ ...country, dial: callingCodes[country.code] }));
export function phoneCountry(code: string) { return PHONE_COUNTRIES.find(country => country.code === code) ?? PHONE_COUNTRIES[0]; }
export function splitPhone(value: string, countryCode = "SN") {
  const compact = value.trim().replace(/[\s().-]/g, "").replace(/^00/, "+");
  const preferred = phoneCountry(countryCode);
  if (!compact.startsWith("+")) return { country: preferred.code, number: value };
  const country = [preferred, ...PHONE_COUNTRIES].find(item => compact.startsWith(`+${item.dial}`));
  // Keep unsupported international prefixes intact rather than reinterpret the number.
  return country ? { country: country.code, number: compact.slice(country.dial.length + 1) } : { country: preferred.code, number: compact };
}
export function internationalPhone(number: string, countryCode: string): string {
  const compact = number.trim().replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (!compact || compact.startsWith("+")) return compact;
  const country = phoneCountry(countryCode);
  // Italy retains its leading zero; the other listed European trunk prefixes do not.
  const national = ["FR", "BE", "DE", "NL", "IE", "GB"].includes(country.code) ? compact.replace(/^0/, "") : compact;
  const digits = ["US", "CA"].includes(country.code) && /^1\d{10}$/.test(national) ? national.slice(1) : national;
  return `+${country.dial}${digits}`;
}
export function isInternationalPhone(value: string) { return /^\+[1-9]\d{7,14}$/.test(value); }
