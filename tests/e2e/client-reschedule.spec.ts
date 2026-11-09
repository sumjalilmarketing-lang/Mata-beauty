import { expect, test } from "@playwright/test";
import { syntheticSession } from "./fixtures/department-workspaces.mjs";

const bookingId = "33333333-3333-4333-8333-333333333333";
const providerId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";

test("client : choisit un nouveau créneau, évite le double clic et affiche uniquement le report confirmé", async ({ page, context }) => {
  const session = syntheticSession("client");
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/", httpOnly: false, sameSite: "Lax" }]);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const startsAt = `${date}T09:00:00Z`, movedAt = `${date}T11:00:00Z`, endsAt = `${date}T12:30:00Z`;
  const booking = { id: bookingId, provider_id: providerId, provider_service_id: serviceId, client_id: session.user.id,
    starts_at: startsAt, ends_at: `${date}T10:30:00Z`, status: "confirmed", total_amount: 15000, currency: "XOF", location_mode: "salon", appointment_address: null,
    provider_services: { title: "Soin de recette", duration_minutes: 90, business_id: null, is_active: true, archived_at: null } };
  await page.route("**/rest/v1/bookings**", route => route.fulfill({ json: [booking], headers: { "Content-Range": "0-0/1", "Access-Control-Allow-Origin": "*" } }));
  let posts = 0;
  await page.route("**/api/bookings/reschedule**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { slots: [{ slot_start: movedAt }] } });
    posts++;
    expect(route.request().postDataJSON()).toEqual({ bookingId, startsAt: movedAt });
    await new Promise(resolve => setTimeout(resolve, 200));
    return route.fulfill({ json: { ok: true, booking: { id: bookingId, startsAt: movedAt, endsAt } } });
  });
  await page.goto("/app/bookings");
  await page.getByRole("button", { name: /Voir l’historique/ }).click();
  await page.getByRole("button", { name: "Déplacer", exact: true }).click();
  const section = page.getByRole("region", { name: "Déplacer votre rendez-vous" });
  await expect(section.getByRole("button", { name: /11:00/ })).toBeVisible();
  await section.getByRole("button", { name: /11:00/ }).click();
  await section.getByRole("button", { name: "Confirmer le report", exact: true }).click();
  await expect(section.getByRole("button", { name: "Enregistrement…", exact: true })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Rendez-vous déplacé au" })).toBeVisible();
  await expect(page.locator(`#booking-${bookingId} time`)).toHaveAttribute("datetime", movedAt);
  expect(posts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
