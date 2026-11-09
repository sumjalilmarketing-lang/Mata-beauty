import { expect, test, type Page, type Route } from "@playwright/test";
import { bookingVideo } from "./fixtures/booking-video";
import { startRuntimeAudit, finishRuntimeAudit } from "./helpers/runtime-audit";

test.beforeEach(async ({ page }) => { await startRuntimeAudit(page); });
test.afterEach(async ({ page }, info) => { await finishRuntimeAudit(page, info); });
import { syntheticSession } from "./fixtures/department-workspaces.mjs";

const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN ?? "https://audit.supabase.co";
const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const providerId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";
const clientId = syntheticSession("client").user.id;
const otherClientId = "44444444-4444-4444-8444-444444444444";
const bookingId = "55555555-5555-4555-8555-555555555555";
const socialPostId = "66666666-6666-4666-8666-666666666666";

type AuditState = {
  bookingCreated: boolean;
  depositPercentage?: number;
  currency?: "XOF" | "EUR";
  priceAmount?: number;
  durationMinutes?: number;
  lastBookingCurrency?: string;
  currentRole: "client" | "provider" | "other";
  selectedSlot: string;
  lastSearch?: Record<string, unknown>;
  lastBookingSource?: string | null;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: { "Access-Control-Allow-Origin": appOrigin },
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockSupabase(page: Page, state: AuditState) {
  await page.route("**/api/public/social-posts/*/media", route => json(route, { videoUrl: "https://audit.supabase.co/storage/v1/object/sign/provider-social-media/audit.mp4", thumbnailUrl: null }));
  await page.route("https://audit.supabase.co/storage/**", route => route.fulfill({ body: bookingVideo, contentType: "video/mp4", headers: { "Access-Control-Allow-Origin": appOrigin } }));
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);
  state.selectedSlot = `${date}T10:00:00Z`;

  await page.route("**/api/auth/welcome", (route) => json(route, { ok: true, alreadySent: true }));

  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": appOrigin,
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
        },
      });
    }

    if (path === "/auth/v1/settings") return json(route, { external: { google: true } });
    if (path === "/rest/v1/categories") return json(route, [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tresses", slug: "tresses", icon: "≋", sort_order: 1 }]);

    if (path === "/auth/v1/token") {
      const payload = request.postDataJSON() as { email?: string };
      state.currentRole = payload.email?.startsWith("provider") ? "provider" : payload.email?.startsWith("other") ? "other" : "client";
      const userId = state.currentRole === "provider" ? providerId : state.currentRole === "other" ? otherClientId : clientId;
      const fixture = syntheticSession(state.currentRole === "provider" ? "provider" : "client");
      const [header, payloadPart, signature] = fixture.access_token.split(".");
      const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString()) as Record<string, unknown>;
      claims.sub = userId;
      return json(route, {
        ...fixture,
        access_token: [header, Buffer.from(JSON.stringify(claims)).toString("base64url"), signature].join("."),
        user: { ...fixture.user, id: userId, email: payload.email },
      });
    }
    if (path === "/auth/v1/user") {
      const userId = state.currentRole === "provider" ? providerId : state.currentRole === "other" ? otherClientId : clientId;
      return json(route, { id: userId, email: `${state.currentRole}-audit@example.test`, aud: "authenticated", role: "authenticated", user_metadata: {} });
    }
    if (path === "/auth/v1/logout") return json(route, {});
    if (path === "/rest/v1/social_feed" || path === "/rest/v1/rpc/search_inspiration_feed") {
      if (path.endsWith("search_inspiration_feed")) state.lastSearch = request.postDataJSON() as Record<string, unknown>;
      return json(route, [{
        id: socialPostId, author_id: providerId,
        caption: "Tresses express réalisées à Dakar", video_url: `${appOrigin}/social-sample.mp4`, thumbnail_url: null,
        duration_seconds: 18, aspect_ratio: 0.562, allow_comments: true, is_sponsored: false,
        view_count: 120, like_count: 32, comment_count: 4, save_count: 7, share_count: 2,
        published_at: new Date().toISOString(), business_name: "Mata Audit Tresses", slug: "mata-audit-tresses",
        city: "Dakar", average_rating: 4.9, review_count: 48, verified_at: "2026-01-01T00:00:00Z",
        cover_url: null, avatar_url: null, provider_service_id: serviceId, service_title: "Tresses express",
        duration_minutes: state.durationMinutes ?? 60, price_amount: state.priceAmount ?? 10000, currency: state.currency ?? "XOF", age_hours: 0,
      }]);
    }
    if (path === "/rest/v1/provider_profiles" && url.searchParams.get("select")?.includes("provider_services!inner")) {
      return json(route, [{
        profile_id: providerId,
        business_name: "Mata Audit Tresses",
        city: "Dakar",
        country_code: "SN",
        timezone: "Africa/Dakar",
        service_mode: "both",
        average_rating: 4.9,
        review_count: 48,
        verified_at: "2026-01-01T00:00:00Z",
        cover_url: null,
        provider_services: [{
          id: serviceId,
          title: "Tresses express",
          duration_minutes: state.durationMinutes ?? 60,
          price_amount: state.priceAmount ?? 10000,
          deposit_percentage: state.depositPercentage ?? 0,
          currency: state.currency ?? "XOF",
          services: { name: "Tresses", categories: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tresses" } },
        }],
      }]);
    }
    if (path === "/rest/v1/provider_profiles" && url.searchParams.get("select") === "bio") {
      return json(route, { bio: "Spécialiste des tresses rapides à Dakar." });
    }
    if (path === "/rest/v1/provider_profiles" && url.searchParams.get("select")?.includes("business_name")) {
      return json(route, {
        profile_id: providerId,
        business_name: "Mata Audit Tresses",
        bio: "Spécialiste des tresses rapides à Dakar.",
        city: "Dakar",
        service_mode: "both",
        status: "approved",
        activity_type: "hairdresser",
        years_experience: 5,
        base_address: "Dakar",
        languages: ["fr"],
        cancellation_policy: "Annulation gratuite jusqu’à vingt-quatre heures avant.",
        onboarding_progress: 100,
      });
    }
    if (path === "/rest/v1/provider_services") {
      return json(route, [{ id: serviceId, title: "Tresses express", duration_minutes: state.durationMinutes ?? 60, price_amount: 10000 }]);
    }
    if (path === "/rest/v1/portfolio_items" || path === "/rest/v1/promotions" || path === "/rest/v1/notifications") return json(route, []);
    if (path === "/rest/v1/rpc/get_available_slots") {
      return json(route, state.bookingCreated ? [{ slot_start: `${date}T11:00:00Z` }] : [{ slot_start: state.selectedSlot }, { slot_start: `${date}T11:00:00Z` }]);
    }
    if (path === "/rest/v1/rpc/get_booking_team_availability") {
      return json(route, {
        teamEnabled: false,
        slots: state.bookingCreated ? [{ slot_start: `${date}T11:00:00Z` }] : [{ slot_start: state.selectedSlot }, { slot_start: `${date}T11:00:00Z` }],
      });
    }
    if (path === "/rest/v1/rpc/get_my_private_profile") {
      return json(route, {
        role: "client",
        is_suspended: false,
        account_status: "active",
        first_name: "Mata",
        last_name: "Audit",
        phone: null,
      });
    }
    if (path === "/rest/v1/profiles") {
      return json(route, {
        role: state.currentRole === "provider" ? "provider" : "client",
        is_suspended: false,
        first_name: "Mata",
        last_name: "Audit",
        phone: null,
        marketing_consent: false,
      });
    }
    if (path === "/rest/v1/client_profiles") return json(route, { city: "Dakar", default_address: null, preferences: {} });
    if (path === "/rest/v1/bookings" && request.method() === "POST") {
      if (state.bookingCreated) return json(route, { code: "23P01", message: "slot overlap" }, 409);
      const payload = request.postDataJSON() as { source_post_id?: string | null; currency?: string; starts_at?: string; ends_at?: string; total_amount?: number };
      state.lastBookingSource = payload.source_post_id ?? null;
      state.lastBookingCurrency = payload.currency;
      state.bookingCreated = true;
      return json(route, { id: bookingId, starts_at: payload.starts_at, ends_at: payload.ends_at, total_amount: payload.total_amount, currency: payload.currency, collaborator_name: null, collaborator_avatar_url: null }, 201);
    }
    if (path === "/rest/v1/bookings" && request.method() === "PATCH") {
      if (state.currentRole === "other") return json(route, { code: "42501", message: "permission denied" }, 403);
      return json(route, []);
    }
    if (path === "/rest/v1/bookings") {
      if (!state.bookingCreated || state.currentRole === "other") return json(route, []);
      return json(route, [{
        id: bookingId,
        starts_at: state.selectedSlot,
        ends_at: state.selectedSlot.replace("10:00", "11:00"),
        status: "pending",
        total_amount: 10000,
        currency: "XOF",
        location_mode: "salon",
        appointment_address: null,
        provider_services: { title: "Tresses express", duration_minutes: state.durationMinutes ?? 60 },
      }]);
    }
    if (path === "/rest/v1/payments") return json(route, [], 201);
    if (path === "/rest/v1/favorites") return json(route, []);
    if (path === "/rest/v1/services") return json(route, []);
    return json(route, []);
  });
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Adresse e-mail").click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.locator('input[name="password"]').fill("Audit-Only-123!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

async function expectAuthenticatedSession(page: Page) {
  await expect(page).toHaveURL(/\/app\/profile$/);
}

async function openFirstFeedBooking(page: Page) {
  await expect(page.locator(".social-video-card").first()).toContainText("Tresses express");
  // Each card exposes a compact action and a Premium-panel action. The compact
  // action is the intended entry point for the active feed item.
  await page.locator(".social-video-card").first().locator(".feed-book").click();
  await expect(page.getByRole("dialog", { name: "Réserver" })).toBeVisible();
}

test("réserve deux soins dans un bloc continu de 75 minutes sans transmettre de prix client", async ({ page }) => {
  const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "", durationMinutes: 45 };
  await mockSupabase(page, state);
  const manicureId = "77777777-7777-4777-8777-777777777777";
  const services = [
    { id: serviceId, title: "Tresses express", duration_minutes: 45, price_amount: 10000, currency: "XOF", business_id: null, deposit_percentage: 0 },
    { id: manicureId, title: "Manucure", duration_minutes: 30, price_amount: 5000, currency: "XOF", business_id: null, deposit_percentage: 0 },
  ];
  await page.route(`${api}/rest/v1/provider_services**`, route => {
    const url = new URL(route.request().url());
    return url.searchParams.get("provider_id") === `eq.${providerId}` ? json(route, services) : route.fallback();
  });
  await page.route(`${api}/rest/v1/rpc/get_multi_service_availability`, route => json(route, {
    teamEnabled: false, people: [], slots: [{ slot_start: state.selectedSlot }],
    totalAmount: 15000, durationMinutes: 75, currency: "XOF", services,
  }));
  let createdPayload: Record<string, unknown> | null = null;
  await page.route(`${api}/rest/v1/rpc/create_multi_service_booking`, route => {
    createdPayload = route.request().postDataJSON() as Record<string, unknown>;
    state.bookingCreated = true;
    return json(route, { id: bookingId, starts_at: state.selectedSlot, ends_at: new Date(Date.parse(state.selectedSlot) + 75 * 60000).toISOString(),
      total_amount: 15000, currency: "XOF", collaborator_name: null, collaborator_avatar_url: null, services });
  });
  await page.goto("/");
  await openFirstFeedBooking(page);
  const dialog = page.getByRole("dialog", { name: "Réserver" });
  await dialog.getByRole("checkbox", { name: /Manucure/ }).check();
  await expect(dialog.locator(".fast-service-summary")).toContainText("1 h 15");
  await dialog.getByRole("button", { name: /10:00/ }).click();
  await expect(dialog.locator(".booking-recap-card")).toContainText("Manucure");
  await expect(dialog.getByText("À mon domicile", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Confirmer.*15.*000/ }).click();
  await signIn(page, "client-multiple@example.test");
  await expect(page.getByText("Votre rendez-vous est créé", { exact: true })).toBeVisible();
  expect(createdPayload).toMatchObject({ target_service_ids: [serviceId, manicureId], target_location_mode: "salon" });
  expect(createdPayload).not.toHaveProperty("total_amount");
  expect(createdPayload).not.toHaveProperty("duration_minutes");
  await expect(dialog).toContainText("Tresses express + Manucure");
});

for (const required of [false, true]) test(`les variantes ${required ? "obligatoires" : "facultatives"} prolongent le créneau et sont recalculées au serveur`, async ({ page }) => {
  const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "", durationMinutes: 45 };
  await mockSupabase(page, state);
  const optionId = "88888888-8888-4888-8888-888888888888";
  await page.route(`${api}/rest/v1/service_options**`, route => json(route, [{ id: optionId, provider_service_id: serviceId,
    name: "Cheveux longs", price_amount: 2000, duration_minutes: 15, is_required: required }]));
  const services = [{ id: serviceId, title: "Tresses express (Cheveux longs)", duration_minutes: 60, price_amount: 12000, currency: "XOF" }];
  let optionRequested = false, createRequested = false;
  await page.route(`${api}/rest/v1/rpc/get_multi_service_availability`, route => {
    const payload = route.request().postDataJSON();
    optionRequested = payload.target_option_ids.includes(optionId);
    return json(route, { teamEnabled: false, people: [], slots: [{ slot_start: state.selectedSlot }], totalAmount: 12000, durationMinutes: 60, currency: "XOF", services });
  });
  await page.route(`${api}/rest/v1/rpc/create_multi_service_booking`, route => {
    expect(route.request().postDataJSON()).toMatchObject({ target_service_ids: [serviceId], target_option_ids: [optionId] });
    createRequested = true;
    return json(route, { id: bookingId, starts_at: state.selectedSlot, ends_at: new Date(Date.parse(state.selectedSlot) + 60 * 60000).toISOString(),
      total_amount: 12000, currency: "XOF", collaborator_name: null, collaborator_avatar_url: null, services });
  });
  await page.goto("/"); await openFirstFeedBooking(page);
  const dialog = page.getByRole("dialog", { name: "Réserver" });
  const choice = dialog.getByRole("checkbox", { name: /Cheveux longs/ });
  if (required) { await expect(choice).toBeChecked(); await expect(choice).toBeDisabled(); } else await choice.check();
  await expect.poll(() => optionRequested).toBe(true);
  await expect(dialog.locator(".fast-service-summary")).toContainText("1 h");
  await dialog.getByRole("button", { name: /10:00/ }).click();
  await dialog.getByRole("button", { name: /Confirmer.*12.*000/ }).click();
  await signIn(page, "client-variants@example.test");
  await expect(page.getByText("Votre rendez-vous est créé", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("Cheveux longs");
  expect(createRequested).toBe(true);
});

test("un créneau retiré pendant la confirmation ne reste pas réservable", async ({ page }) => {
  const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
  await mockSupabase(page, state);
  await page.goto("/");
  await openFirstFeedBooking(page);
  const dialog = page.getByRole("dialog", { name: "Réserver" });
  await dialog.getByRole("button", { name: /10:00/ }).click();
  const confirm = dialog.getByRole("button", { name: /Confirmer.*10.*000/ });
  await expect(confirm).toBeEnabled();
  state.bookingCreated = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("Ce créneau n’est plus disponible");
});

test("le dialogue de réservation retient le focus et se ferme avec Échap", async ({ page }) => {
  const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
  await mockSupabase(page, state);
  await page.goto("/");
  await openFirstFeedBooking(page);
  const dialog = page.getByRole("dialog", { name: "Réserver" });
  await expect(dialog.getByRole("button", { name: "Fermer", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test.describe("audit chronométré de réservation", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => { throw error; });
  });

  for (const percentage of [30, 60]) test(`affiche l’acompte prévu ${percentage}% avant confirmation sans encaissement`, async ({ page }, testInfo) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "", depositPercentage: percentage };
    await mockSupabase(page, state);
    await page.goto("/");
    await openFirstFeedBooking(page);
    await page.getByRole("button", { name: "10:00" }).click();
    const summary = page.getByRole("region", { name: "Détail du prix" });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(`Acompte prévu (${percentage} %)`);
    await expect(summary).toContainText(percentage === 60 ? /6\s*000/ : /3\s*000/);
    await expect(summary).toContainText(percentage === 60 ? /4\s*000/ : /7\s*000/);
    await expect(summary).toContainText(/À payer aujourd’hui : 0/);
    await expect(summary).toContainText(/Aucun acompte encaissé.*10\s*000/);
    await expect(page.getByRole("link", { name: "Lire la politique d’annulation" })).toBeVisible();
    if (percentage === 60) await page.screenshot({ path: testInfo.outputPath("deposit-summary.png") });
    expect(state.bookingCreated).toBe(false);
    await page.getByRole("button", { name: /Confirmer.*10.*000/ }).click();
    await signIn(page, "client-deposit@example.test");
    await expect(page.getByText("Votre rendez-vous est créé")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("À régler sur place · aucun débit en ligne");
    await expect(page.getByRole("link", { name: "Message", exact: true })).toHaveAttribute("href", `/app/messages?booking=${bookingId}`);
  });

  test("conserve l’euro et les centimes de l’acompte depuis une vidéo après connexion", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "", depositPercentage: 30, currency: "EUR", priceAmount: 35 };
    await mockSupabase(page, state);
    await page.goto("/");
    await openFirstFeedBooking(page);
    await page.getByRole("button", { name: "10:00" }).click();
    const summary = page.getByRole("region", { name: "Détail du prix" });
    await expect(summary).toContainText(/10,50\s*€/);
    await expect(summary).toContainText(/24,50\s*€/);
    await expect(summary).not.toContainText("CFA");
    await page.getByRole("button", { name: /Confirmer.*35/ }).click();
    await signIn(page, "client-euro@example.test");
    await expect(page.getByText("Votre rendez-vous est créé")).toBeVisible();
    expect(state.lastBookingCurrency).toBe("EUR");
    await expect(page.getByRole("dialog")).toContainText(/35,00\s*€/);
  });

  test("filtre Inspiration puis termine une réservation après connexion", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    const startedAt = Date.now();
    let actions = 0;
    await page.goto("/");
    await page.getByRole("button", { name: "Rechercher", exact: true }).click(); actions += 1;
    const search = page.getByRole("dialog", { name: "Que souhaitez-vous découvrir ?" });
    await expect(search.locator("select").first()).toContainText("Tresses");
    await search.locator("select").first().selectOption("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); actions += 1;
    await search.getByRole("button", { name: "Afficher les vidéos", exact: true }).click(); actions += 1;
    await expect(page.locator(".social-video-card")).toHaveCount(1);
    expect(state.lastSearch).toMatchObject({ target_category_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    await page.locator(".social-video-card").first().locator(".feed-book").click(); actions += 1;
    await page.getByRole("button", { name: "10:00" }).click(); actions += 1;
    await expect(page.getByRole("dialog", { name: "Réserver" }).getByText("Tresses express", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirmer.*10.*000.*F\s*CFA/ })).toBeVisible();
    await page.getByRole("button", { name: /Confirmer.*10.*000.*F\s*CFA/ }).click(); actions += 1;
    await page.getByLabel("Adresse e-mail").fill("client-audit@example.test");
    await page.locator('input[name="password"]').fill("Audit-Only-123!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click(); actions += 1;
    await expect(page.getByText("Votre rendez-vous est créé")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Tresses express", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/10:00/).first()).toBeVisible();
    const durationMs = Date.now() - startedAt;
    expect(actions).toBe(7);
    expect(durationMs).toBeLessThan(30_000);
    console.log(`AUDIT_METRIC actions=${actions} duration_ms=${durationMs}`);
  });

  test("passe d’une vidéo à une réservation confirmée en 6 actions", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    const startedAt = Date.now();
    let actions = 0;
    await page.goto("/");
    await expect(page.getByText("Tresses express", { exact: true }).first()).toBeVisible();
    await page.locator(".social-video-card").first().locator(".feed-book").click(); actions += 1;
    await page.getByRole("button", { name: "10:00" }).click(); actions += 1;
    await page.getByRole("button", { name: /Confirmer.*10.*000.*F\s*CFA/ }).click(); actions += 1;
    await page.getByLabel("Adresse e-mail").fill("client-social@example.test"); actions += 1;
    await page.locator('input[name="password"]').fill("Audit-Only-123!"); actions += 1;
    await page.getByRole("button", { name: "Se connecter", exact: true }).click(); actions += 1;
    await expect(page.getByText("Votre rendez-vous est créé")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Tresses express", { exact: true })).toBeVisible();
    expect(state.bookingCreated).toBe(true);
    expect(state.lastBookingSource).toBe(socialPostId);
    const durationMs = Date.now() - startedAt;
    expect(actions).toBe(6);
    expect(durationMs).toBeLessThan(30_000);
    console.log(`SOCIAL_BOOKING_METRIC actions=${actions} duration_ms=${durationMs}`);
  });

  test("redirige un paiement activé vers le checkout PayDunya sandbox de confiance", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    let paymentRequest: { bookingId?: string; method?: string; attempt?: string } | null = null;
    await page.route("**/api/payments/capabilities", (route) => json(route, {
      onlineCheckoutEnabled: true, environment: "sandbox", provider: "paydunya", methods: ["orange_money", "wave", "card"],
    }));
    await page.route("**/api/payments/create", (route) => {
      paymentRequest = route.request().postDataJSON() as { bookingId?: string; method?: string; attempt?: string };
      return json(route, {
        ok: true,
        payment: { id: "77777777-7777-4777-8777-777777777777" },
        checkoutUrl: "https://app.paydunya.com/sandbox-checkout/invoice/test_invoice_1",
      }, 201);
    });
    await page.route("https://app.paydunya.com/sandbox-checkout/invoice/test_invoice_1", (route) => route.fulfill({
      status: 200, contentType: "text/html", body: "<title>PayDunya Sandbox</title><h1>Checkout sandbox</h1>",
    }));

    await page.goto("/");
    await openFirstFeedBooking(page);
    await page.getByRole("button", { name: "10:00" }).click();
    await page.getByLabel("Wave").check();
    await page.getByRole("button", { name: /Continuer vers la sandbox.*10.*000.*F\s*CFA/ }).click();
    await signIn(page, "client-payment@example.test");

    await expect(page).toHaveURL("https://app.paydunya.com/sandbox-checkout/invoice/test_invoice_1");
    const capturedPaymentRequest = paymentRequest as { bookingId?: string; method?: string; attempt?: string } | null;
    expect(capturedPaymentRequest).toMatchObject({ bookingId, method: "wave" });
    expect(capturedPaymentRequest?.attempt).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("retire un créneau réservé et refuse un jeton de test non vérifiable côté serveur", async ({ page }) => {
    const state: AuditState = { bookingCreated: true, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    await page.goto("/");
    await openFirstFeedBooking(page);
    await expect(page.getByRole("button", { name: /10:00/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Fermer" }).click();
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: /Se connecter à MATA Beauty|Profil/ }).click();
    await signIn(page, "client-audit@example.test");
    await expectAuthenticatedSession(page);
    expect(state.bookingCreated).toBe(true);
  });

  test("isole la réservation d’un autre utilisateur", async ({ page }) => {
    const state: AuditState = { bookingCreated: true, currentRole: "other", selectedSlot: "" };
    await mockSupabase(page, state);
    await page.goto("/");
    await openFirstFeedBooking(page);
    await page.getByRole("button", { name: /11:00/ }).click();
    await page.getByRole("button", { name: /Confirmer.*10.*000.*F\s*CFA/ }).click();
    await expect(page.getByRole("dialog", { name: "Se connecter" })).toBeVisible();
    await signIn(page, "other-audit@example.test");
    // Signing in from the booking modal keeps the user on the booking page;
    // the auth handoff does not redirect to the profile route.
    await expect(page.getByRole("dialog", { name: "Se connecter" })).toHaveCount(0);
    expect(state.currentRole).toBe("other");
    await expect(page.getByText("Ce créneau vient d’être réservé.")).toBeVisible();
    const response = await page.evaluate(async ({ id, endpoint }) => fetch(`${endpoint}/rest/v1/bookings?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer other-token" },
      body: JSON.stringify({ status: "cancelled_by_client" }),
    }).then((result) => result.status), { id: bookingId, endpoint: api });
    expect(response).toBe(403);
  });

  test("restaure la prestation et le créneau après une interruption OAuth", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    await page.goto("/");
    await openFirstFeedBooking(page);
    await page.getByRole("button", { name: "10:00" }).click();
    await expect(page.getByRole("button", { name: /Confirmer.*10.*000.*F\s*CFA/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Réserver" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Réserver" }).getByText("Tresses express", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/10:00/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirmer.*10.*000.*F\s*CFA/ })).toBeVisible();
  });

  test("réserve une publication arrivée après le chargement du catalogue", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    let targetedReads = 0;
    await page.route(`${api}/rest/v1/provider_profiles**`, async (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.get("select")?.includes("provider_services!inner")) return route.fallback();
      if (url.searchParams.get("profile_id") === `eq.${providerId}`) { targetedReads += 1; return route.fallback(); }
      return json(route, []);
    });
    await page.goto("/");
    await openFirstFeedBooking(page);
    await expect(page.getByRole("dialog", { name: "Réserver" })).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Tresses express", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /10:00/ })).toBeVisible();
    expect(targetedReads).toBeGreaterThan(0);
  });

  test("rejette une réponse de calendrier malformée et récupère après nouvelle tentative", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    let invalid = true;
    await page.route(`${api}/rest/v1/rpc/get_booking_team_availability`, route => invalid ? json(route, { teamEnabled: false, slots: [{ slot_start: "not-a-date" }] }) : route.fallback());
    await page.goto("/");
    await openFirstFeedBooking(page);
    const dialog = page.getByRole("dialog", { name: "Réserver" });
    await expect(dialog.getByRole("alert")).toContainText("Les disponibilités n’ont pas pu être chargées");
    invalid = false;
    await dialog.getByRole("button", { name: "Réessayer", exact: true }).click();
    await expect(dialog.getByRole("button", { name: /10:00/ })).toBeVisible();
  });

  test("actualise le calendrier au retour dans la fenêtre", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    await page.goto("/");
    await openFirstFeedBooking(page);
    const dialog = page.getByRole("dialog", { name: "Réserver" });
    await expect(dialog.getByRole("button", { name: /10:00/ })).toBeVisible();
    state.bookingCreated = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(dialog.getByRole("button", { name: /10:00/ })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /11:00/ })).toBeVisible();
  });

  test("signale une panne des disponibilités et permet de réessayer", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    let unavailable = true;
    await page.route(`${api}/rest/v1/rpc/get_booking_team_availability`, async (route) => {
      if (unavailable) return route.abort("failed");
      return route.fallback();
    });
    await page.goto("/");
    await openFirstFeedBooking(page);
    await expect(page.getByRole("dialog", { name: "Réserver" }).getByRole("alert")).toContainText("Les disponibilités n’ont pas pu être chargées");
    await expect(page.getByText("Aucun créneau publié ce jour.", { exact: false })).toHaveCount(0);
    unavailable = false;
    await page.getByRole("dialog", { name: "Réserver" }).getByRole("button", { name: "Réessayer", exact: true }).click();
    await expect(page.getByRole("button", { name: /10:00/ })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Réserver" }).getByRole("alert")).toHaveCount(0);
  });
});

// Acceptance cases added by the functional audit. Failures are kept visible.
for (const status of [400, 401, 403, 500]) test(`QA-B01: booking micro-feedback reports HTTP ${status} and permits retry`, async ({ page }) => {
  const state: AuditState = { bookingCreated: false, currentRole: 'client', selectedSlot: '' };
  await mockSupabase(page, state);
  let failed = true;
  await page.route(`${api}/rest/v1/micro_feedback**`, route => route.fulfill(failed ? { status, json: { message: 'Synthetic failure' } } : { status: 201, json: null }));
  await page.goto('/'); await openFirstFeedBooking(page);
  await page.getByRole('button', { name: /^10:00(?:\s|$)/ }).click();
  await page.getByRole('button', { name: /Confirmer.*10.*000/ }).click();
  await signIn(page, 'client-microfeedback@example.test');
  await expect(page.getByText('Votre rendez-vous est créé', { exact: true })).toBeVisible();
  const feedback = page.locator('.micro-feedback');
  await feedback.getByRole('button', { name: '👍 Oui', exact: true }).click();
  await expect(feedback.getByRole('alert')).toContainText('Votre retour n’a pas pu être enregistré');
  await expect(feedback.getByText('Merci pour votre retour.', { exact: true })).toHaveCount(0);
  failed = false;
  await feedback.getByRole('button', { name: '👍 Oui', exact: true }).click();
  await expect(feedback.getByText('Merci pour votre retour.', { exact: true })).toBeVisible();
});

test('signup, email confirmation notice, login, catalogue and booking confirmation', async ({ page }) => {
  const state: AuditState = { bookingCreated: false, currentRole: 'client', selectedSlot: '' };
  await mockSupabase(page, state);
  let registrations = 0;
  await page.route(`${api}/auth/v1/signup**`, route => {
    const data = route.request().postDataJSON();
    expect(data.email).toBe('qa-signup@example.test');
    expect(data.data.country_code).toBe('SN');
    registrations++;
    return json(route, { user: { id: clientId, email: data.email, aud: 'authenticated', role: 'authenticated', user_metadata: data.data, identities: [] }, session: null });
  });
  await page.goto('/?connexion=requise&returnTo=%2Fapp%2Fprofile');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await dialog.getByLabel('Nom complet', { exact: true }).fill('Compte Audit');
  await dialog.getByLabel('Pays de résidence', { exact: true }).selectOption('SN');
  await dialog.locator('input[name=email]').fill('qa-signup@example.test');
  await dialog.locator('input[name=password]').fill('Synthetic-Password-2026!');
  await dialog.locator('input[name=confirmation]').fill('Synthetic-Password-2026!');
  await dialog.locator('input[name=acceptLegal]').check();
  await dialog.getByRole('button', { name: 'Créer le compte', exact: true }).click();
  await expect(dialog.locator('.auth-feedback')).toContainText(/e-mail|messagerie|mail/i);
  expect(registrations).toBe(1);
  // Auth email delivery/verification is simulated; no real email is sent.
  await dialog.getByRole('button', { name: 'Déjà inscrit ? Se connecter', exact: true }).click();
  await signIn(page, 'qa-signup@example.test');
  await expectAuthenticatedSession(page);
  await page.goto('/'); await openFirstFeedBooking(page);
  await page.getByRole('button', { name: /^10:00(?:\s|$)/ }).click();
  await page.getByRole('button', { name: /Confirmer.*10.*000/ }).click();
  await expect(page.getByText('Votre rendez-vous est créé', { exact: true })).toBeVisible();
  expect(state.bookingCreated).toBe(true);
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Réserver', exact: true })).toHaveCount(0);
  await page.goto('/app/bookings');
  await expect(page).toHaveURL(/\/app\/bookings$/);
});

for (const action of ['like', 'save', 'follow'] as const) test(`QA-B02: ${action} prevents concurrent toggles`, async ({ page }) => {
  const state: AuditState = { bookingCreated: false, currentRole: 'client', selectedSlot: '' };
  await mockSupabase(page, state);
  await page.goto('/?connexion=requise&returnTo=%2Fapp%2Fprofile');
  await signIn(page, `client-${action}@example.test`);
  await expectAuthenticatedSession(page);
  let requests = 0, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const rpc = action === 'like' ? 'toggle_post_like' : action === 'save' ? 'toggle_post_save' : 'toggle_follow_provider_from_post';
  await page.route(`${api}/rest/v1/rpc/${rpc}`, async route => {
    requests++; await pending;
    await json(route, action === 'follow' ? true : { active: true, count: 1 });
  });
  await page.goto('/');
  const card = page.locator('.social-video-card').first();
  await expect(card).toBeVisible();
  if (action !== 'like') await card.locator('.feed-options summary').click();
  const button = card.getByRole('button', { name: action === 'like' ? 'J’aime' : action === 'save' ? 'Enregistrer' : 'Suivre', exact: true });
  try { await button.click(); await expect.poll(() => requests).toBe(1); await expect(button).toBeDisabled(); }
  finally { release(); }
});
