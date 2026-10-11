import { expect, test } from "@playwright/test";

// Existing public offer only: this test creates no user, service, calendar or booking.
const serviceId = process.env.REMOTE_INDEPENDENT_SERVICE_ID ?? "";
const requestedDate = process.env.REMOTE_INDEPENDENT_DATE;

test("indépendant anonyme : créneaux valides, récapitulatif et connexion requise", async ({ page }) => {
  test.setTimeout(120000);
  expect(serviceId, "REMOTE_INDEPENDENT_SERVICE_ID doit désigner une prestation indépendante existante").toMatch(/^[0-9a-f-]{36}$/i);
  const errors: string[] = [], forbiddenWrites: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/rest/v1/bookings*", async route => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      forbiddenWrites.push("booking mutation attempted");
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  await page.route("**/auth/v1/signup*", async route => {
    forbiddenWrites.push("account creation attempted");
    await route.abort("blockedbyclient");
  });
  const initialAvailability = page.waitForResponse(response => {
    if (!response.url().includes("/rpc/get_booking_team_availability") || response.request().method() !== "POST") return false;
    const body = response.request().postDataJSON() as { target_service_id?: string };
    return body.target_service_id === serviceId;
  });
  await page.goto(`/?service=${serviceId}`);
  const booking = page.getByRole("dialog", { name: "Réserver", exact: true });
  await expect(booking).toBeVisible();
  await page.waitForLoadState("networkidle");
  let lastAvailability = await initialAvailability;
  const serviceTitle = await booking.locator(".fast-service-summary strong").textContent();
  const price = await booking.locator(".fast-service-summary b").textContent();
  expect(serviceTitle?.trim()).toBeTruthy(); expect(price?.trim()).toBeTruthy();
  const dates = requestedDate ? [requestedDate] : Array.from({ length: 7 }, (_, i) => new Date(Date.now() + (i + 1) * 86400000).toISOString().slice(0, 10));
  let expectedTimes: string[] = [];
  for (const date of dates) {
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dateInput = booking.getByLabel("Choisir une autre date");
    if (await dateInput.inputValue() !== date) {
      const responsePromise = page.waitForResponse(response => {
        if (!response.url().includes("/rpc/get_booking_team_availability") || response.request().method() !== "POST") return false;
        const body = response.request().postDataJSON() as { target_service_id?: string; from_date?: string };
        return body.target_service_id === serviceId && body.from_date === date;
      });
      await dateInput.fill(date);
      lastAvailability = await responsePromise;
    }
    const response = lastAvailability;
    expect((response.request().postDataJSON() as { from_date: string }).from_date).toBe(date);
    expect(response.status()).toBe(200);
    const payload = await response.json() as { teamEnabled: boolean; slots: unknown[] };
    expect(payload.teamEnabled, "La prestation choisie doit utiliser le parcours indépendant").toBe(false);
    expect(Array.isArray(payload.slots)).toBe(true);
    const timestamps = payload.slots.map(slot => {
      expect(slot, "Chaque créneau doit être un objet slot_start, jamais une chaîne ISO seule").toMatchObject({ slot_start: expect.any(String) });
      const timestamp = (slot as { slot_start: string }).slot_start;
      expect(Number.isFinite(Date.parse(timestamp)), "Horodatage du créneau valide").toBe(true);
      return timestamp;
    });
    expectedTimes = [...new Set(timestamps.map(timestamp => new Date(timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" })))];
    if (expectedTimes.length) break;
  }
  expect(expectedTimes.length, "Au moins un créneau réel doit exister sur les dates testées").toBeGreaterThan(0);
  const slots = booking.locator(".premium-slot-grid button");
  await expect(slots).toHaveCount(expectedTimes.length);
  const labels = await slots.allTextContents();
  for (const label of labels) expect(label).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  expect(labels).toEqual(expectedTimes);
  const selectedTime = expectedTimes.includes("10:00") ? "10:00" : expectedTimes[0];
  await booking.locator(".premium-slot-grid").getByRole("button", { name: selectedTime, exact: true }).click();
  await expect(booking.getByRole("heading", { name: "Vérifiez et confirmez", exact: true })).toBeVisible();
  await expect(booking.locator(".booking-recap-card")).toContainText(serviceTitle!.trim());
  await expect(booking.locator(".booking-recap-card")).toContainText(price!.trim());
  await expect(booking.locator(".booking-recap-card")).toContainText(selectedTime);
  await page.screenshot({ path: "work/employee-assignment/independent-booking-production.png", fullPage: true });
  await booking.getByRole("button", { name: /^Confirmer ·/ }).click();
  await expect(page.getByLabel("Adresse e-mail", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
  await expect(page.getByText("Votre rendez-vous est créé", { exact: true })).toHaveCount(0);
  expect(forbiddenWrites).toEqual([]);
  expect(errors).toEqual([]);
});
