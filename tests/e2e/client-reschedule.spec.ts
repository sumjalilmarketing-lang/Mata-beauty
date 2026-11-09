import { expect, test } from "@playwright/test";
import { qaLogin } from "./helpers/qa-session";

const bookingId = "33333333-3333-4333-8333-333333333333";
const providerId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";

test("client : choisit un nouveau créneau, évite le double clic et affiche uniquement le report confirmé", async ({ page, context }) => {
  const session = await qaLogin(context, "client");
  const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN!;
  const fixtureHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Range" };
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const startsAt = `${date}T09:00:00Z`, movedAt = `${date}T11:00:00Z`, endsAt = `${date}T12:30:00Z`;
  const booking = { id: bookingId, provider_id: providerId, provider_service_id: serviceId, client_id: session.user.id,
    starts_at: startsAt, ends_at: `${date}T10:30:00Z`, status: "confirmed", total_amount: 15000, currency: "XOF", location_mode: "salon", appointment_address: null,
    provider_services: { title: "Soin de recette", duration_minutes: 90, business_id: null, is_active: true, archived_at: null } };
  // The shared identity fixture intentionally represents an own-profile object.
  // Public decoration reads are collection queries and require collection rows.
  let providerReads = 0, avatarReads = 0;
  await page.route(`${api}/rest/v1/provider_profiles**`, route => {
    const query = new URL(route.request().url()).searchParams;
    if (!query.get("profile_id")?.startsWith("in.")) return route.fallback();
    expect(query.get("profile_id")).toContain(providerId);
    providerReads++;
    return route.fulfill({ headers: fixtureHeaders, json: [{ profile_id: providerId, business_name: "Institut de recette", slug: "institut-recette", city: "Dakar", base_address: "Dakar", logo_url: null, cover_url: null, country_code: "SN", timezone: "Africa/Dakar" }] });
  });
  await page.route(`${api}/rest/v1/profiles**`, route => {
    const query = new URL(route.request().url()).searchParams;
    if (!query.get("id")?.startsWith("in.")) return route.fallback();
    expect(query.get("id")).toContain(providerId);
    expect(query.get("select")).toBe("id,avatar_url");
    avatarReads++;
    return route.fulfill({ headers: fixtureHeaders, json: [{ id: providerId, avatar_url: null }] });
  });
  await page.route(`${api}/rest/v1/bookings**`, route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get("client_id")).toBe(`eq.${session.user.id}`);
    if (route.request().method() === "HEAD") {
      const count = query.get("status") === "eq.pending" || query.get("ends_at")?.startsWith("lt.") ? 0 : 1;
      return route.fulfill({ body: "", headers: { ...fixtureHeaders, "Content-Range": `*/${count}` } });
    }
    return route.fulfill({ headers: fixtureHeaders, json: [booking] });
  });
  let posts = 0;
  let releaseConfirmation: () => void = () => {};
  const confirmation = new Promise<void>(resolve => { releaseConfirmation = resolve; });
  await page.route("**/api/bookings/reschedule**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { slots: [{ slot_start: movedAt }] } });
    posts++;
    expect(route.request().postDataJSON()).toEqual({ bookingId, startsAt: movedAt });
    await confirmation;
    return route.fulfill({ json: { ok: true, booking: { id: bookingId, startsAt: movedAt, endsAt } } });
  });
  await page.goto("/app/bookings");
  await expect(page.getByRole("heading", { name: "Mes réservations", exact: true })).toBeVisible();
  const history = page.getByRole("button", { name: /Voir l’historique/ });
  await expect(history).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Impossible de charger le tableau de bord." })).toHaveCount(0);
  expect(providerReads).toBeGreaterThan(0);
  expect(avatarReads).toBeGreaterThan(0);
  await history.click();
  await page.getByRole("button", { name: "Déplacer", exact: true }).click();
  const section = page.getByRole("region", { name: "Déplacer votre rendez-vous" });
  await expect(section.getByRole("button", { name: /11:00/ })).toBeVisible();
  await section.getByRole("button", { name: /11:00/ }).click();
  await section.getByRole("button", { name: "Confirmer le report", exact: true }).click();
  await expect(section.getByRole("button", { name: "Enregistrement…", exact: true })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Rendez-vous déplacé au" })).toHaveCount(0);
  releaseConfirmation();
  await expect(page.getByRole("status").filter({ hasText: "Rendez-vous déplacé au" })).toBeVisible();
  await expect(page.locator(`#booking-${bookingId} time`)).toHaveAttribute("datetime", movedAt);
  expect(posts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
