import { expect, it } from "vitest";
import { activityLocationReady, serviceDetailsError } from "../../lib/domain/service-creation";
const service = { serviceId: "11111111-1111-4111-8111-111111111111", title: "Tresses — création personnalisée", durationMinutes: 37, priceAmount: 15000 };
it("accepts free service names and a duration that is not a multiple of fifteen", () => { expect(serviceDetailsError(service)).toBeNull(); });
it("rejects invalid server-contract durations and missing names", () => {
  for (const durationMinutes of [0,14,721,37.5,NaN]) expect(serviceDetailsError({ ...service, durationMinutes })).not.toBeNull();
  expect(serviceDetailsError({ ...service, title: " " })).not.toBeNull();
});
it("requires all three activity settings without guessing a country or currency", () => {
  expect(activityLocationReady({ country_code: "FR", timezone: "Europe/Paris", currency: "EUR" })).toBe(true);
  expect(activityLocationReady({ country_code: null, timezone: null, currency: "XOF" })).toBe(false);
});
