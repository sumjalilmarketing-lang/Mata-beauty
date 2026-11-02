import { isIanaTimeZone } from "./time-zone";

// A provider can run establishments in several countries. Each appointment
// belongs to its establishment's clock, even in the provider's shared inbox.
export function bookingTimeZone(businessTimeZone?: string | null, providerTimeZone?: string | null, countryCode?: string | null): string {
  if (businessTimeZone && isIanaTimeZone(businessTimeZone)) return businessTimeZone;
  if (providerTimeZone && isIanaTimeZone(providerTimeZone)) return providerTimeZone;
  return countryCode === "SN" ? "Africa/Dakar" : "UTC";
}
