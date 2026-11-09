import { expect, it } from "vitest";
import { bookingServiceTitle } from "../../lib/domain/booking-service-title";

it("shows every historical service even if the first service was renamed", () => {
  expect(bookingServiceTitle([{ title: "Soin visage" }, { title: "Manucure" }], "Nouveau nom")).toBe("Soin visage + Manucure");
});
it("keeps legacy and invalid snapshots readable", () => {
  for (const snapshot of [null, undefined, [], [{ title: null }], "invalid"]) expect(bookingServiceTitle(snapshot, "Coiffure")).toBe("Coiffure");
});
