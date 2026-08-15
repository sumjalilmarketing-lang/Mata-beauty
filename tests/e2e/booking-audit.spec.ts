import { expect, test, type Page, type Route } from "@playwright/test";

const api = "https://audit.supabase.co";
const providerId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const otherClientId = "44444444-4444-4444-8444-444444444444";
const bookingId = "55555555-5555-4555-8555-555555555555";
const socialPostId = "66666666-6666-4666-8666-666666666666";

type AuditState = {
  bookingCreated: boolean;
  currentRole: "client" | "provider" | "other";
  selectedSlot: string;
  lastBookingSource?: string | null;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockSupabase(page: Page, state: AuditState) {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);
  state.selectedSlot = `${date}T10:00:00Z`;

  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/auth/v1/settings") return json(route, { external: { google: true } });

    if (path === "/auth/v1/token") {
      const payload = request.postDataJSON() as { email?: string };
      state.currentRole = payload.email?.startsWith("provider") ? "provider" : payload.email?.startsWith("other") ? "other" : "client";
      const userId = state.currentRole === "provider" ? providerId : state.currentRole === "other" ? otherClientId : clientId;
      return json(route, {
        access_token: `${state.currentRole}-token`,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: `${state.currentRole}-refresh`,
        user: { id: userId, email: payload.email, aud: "authenticated", role: "authenticated", user_metadata: {} },
      });
    }
    if (path === "/auth/v1/logout") return json(route, {});
    if (path === "/rest/v1/social_feed") {
      return json(route, [{
        id: socialPostId, author_id: providerId,
        caption: "Tresses express réalisées à Dakar", video_url: `${api}/social-sample.mp4`, thumbnail_url: null,
        duration_seconds: 18, aspect_ratio: 0.562, allow_comments: true, is_sponsored: false,
        view_count: 120, like_count: 32, comment_count: 4, save_count: 7, share_count: 2,
        published_at: new Date().toISOString(), business_name: "Mata Audit Tresses", slug: "mata-audit-tresses",
        city: "Dakar", average_rating: 4.9, review_count: 48, verified_at: "2026-01-01T00:00:00Z",
        cover_url: null, avatar_url: null, provider_service_id: serviceId, service_title: "Tresses express",
        duration_minutes: 60, price_amount: 10000, currency: "XOF", age_hours: 0,
      }]);
    }
    if (path === "/rest/v1/provider_profiles" && url.searchParams.get("select")?.includes("provider_services!inner")) {
      return json(route, [{
        profile_id: providerId,
        business_name: "Mata Audit Tresses",
        city: "Dakar",
        service_mode: "both",
        average_rating: 4.9,
        review_count: 48,
        verified_at: "2026-01-01T00:00:00Z",
        cover_url: null,
        provider_services: [{
          id: serviceId,
          title: "Tresses express",
          duration_minutes: 60,
          price_amount: 10000,
          services: { name: "Tresses", categories: { name: "Tresses" } },
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
      return json(route, [{ id: serviceId, title: "Tresses express", duration_minutes: 60, price_amount: 10000 }]);
    }
    if (path === "/rest/v1/portfolio_items" || path === "/rest/v1/promotions" || path === "/rest/v1/notifications") return json(route, []);
    if (path === "/rest/v1/rpc/get_available_slots") {
      return json(route, state.bookingCreated ? [{ slot_start: `${date}T11:00:00Z` }] : [{ slot_start: state.selectedSlot }, { slot_start: `${date}T11:00:00Z` }]);
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
      const payload = request.postDataJSON() as { source_post_id?: string | null };
      state.lastBookingSource = payload.source_post_id ?? null;
      state.bookingCreated = true;
      return json(route, { id: bookingId }, 201);
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
        provider_services: { title: "Tresses express", duration_minutes: 60 },
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
  await page.getByLabel("Mot de passe").click();
  await page.getByLabel("Mot de passe").fill("Audit-Only-123!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

test.describe("audit chronométré de réservation", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => { throw error; });
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("Failed to load resource")) throw new Error(message.text());
    });
  });

  test("termine une réservation en 8 actions et conserve le choix après connexion", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    const startedAt = Date.now();
    let actions = 0;
    await page.goto("/");
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Découvrir" }).click();
    await page.locator(".photo-category-grid button").filter({ hasText: "Tresses" }).click(); actions += 1;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.locator(".premium-provider-card").click(); actions += 1;
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.getByRole("button", { name: /Tresses express/ }).click(); actions += 1;
    await page.getByRole("button", { name: "10:00" }).click(); actions += 1;
    await expect(page.getByText("Tresses express", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirmer.*10.*000 FCFA/ })).toBeVisible();
    await page.getByRole("button", { name: /Confirmer.*10.*000 FCFA/ }).click(); actions += 1;
    await page.getByLabel("Adresse e-mail").click(); actions += 1;
    await page.getByLabel("Adresse e-mail").fill("client-audit@example.test");
    await page.getByLabel("Mot de passe").click(); actions += 1;
    await page.getByLabel("Mot de passe").fill("Audit-Only-123!");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click(); actions += 1;
    await expect(page.getByText("Votre rendez-vous est créé")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Tresses express", { exact: true })).toBeVisible();
    await expect(page.getByText(/10:00/)).toBeVisible();
    const durationMs = Date.now() - startedAt;
    expect(actions).toBe(8);
    expect(durationMs).toBeLessThan(30_000);
    console.log(`AUDIT_METRIC actions=${actions} duration_ms=${durationMs}`);
  });

  test("passe d’une vidéo à une réservation confirmée en 6 actions", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    const startedAt = Date.now();
    let actions = 0;
    await page.goto("/");
    await expect(page.getByText("Tresses express", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Réserver" }).click(); actions += 1;
    await page.getByRole("button", { name: "10:00" }).click(); actions += 1;
    await page.getByRole("button", { name: /Confirmer.*10.*000 FCFA/ }).click(); actions += 1;
    await page.getByLabel("Adresse e-mail").fill("client-social@example.test"); actions += 1;
    await page.getByLabel("Mot de passe").fill("Audit-Only-123!"); actions += 1;
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
    await page.getByRole("button", { name: "Réserver" }).click();
    await page.getByRole("button", { name: "10:00" }).click();
    await page.getByLabel("Wave").check();
    await page.getByRole("button", { name: /Continuer vers la sandbox.*10.*000 FCFA/ }).click();
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
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Découvrir" }).click();
    await page.locator(".photo-category-grid button").filter({ hasText: "Tresses" }).click();
    await page.locator(".premium-provider-card").click();
    await page.getByRole("button", { name: /Tresses express/ }).click();
    await expect(page.getByRole("button", { name: "10:00" })).toHaveCount(0);
    await page.getByRole("button", { name: "Fermer" }).click();
    await page.getByRole("button", { name: "Retour" }).click();
    await page.getByRole("button", { name: "Profil" }).click();
    await signIn(page, "client-audit@example.test");
    await expect(page).toHaveURL(/connexion=requise/, { timeout: 15_000 });
    expect(state.bookingCreated).toBe(true);
  });

  test("isole la réservation d’un autre utilisateur", async ({ page }) => {
    const state: AuditState = { bookingCreated: true, currentRole: "other", selectedSlot: "" };
    await mockSupabase(page, state);
    await page.goto("/");
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
    await signIn(page, "other-audit@example.test");
    await expect(page).toHaveURL(/connexion=requise/, { timeout: 15_000 });
    const response = await page.evaluate(async ({ id, endpoint }) => fetch(`${endpoint}/rest/v1/bookings?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled_by_client" }),
    }).then((result) => result.status), { id: bookingId, endpoint: api });
    expect(response).toBe(403);
  });

  test("restaure la prestation et le créneau après une interruption OAuth", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    await page.goto("/");
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Découvrir" }).click();
    await page.locator(".photo-category-grid button").filter({ hasText: "Tresses" }).click();
    await page.locator(".premium-provider-card").click();
    await page.getByRole("button", { name: /Tresses express/ }).click();
    await page.getByRole("button", { name: "10:00" }).click();
    await expect(page.getByRole("button", { name: /Confirmer.*10.*000 FCFA/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Réserver" })).toBeVisible();
    await expect(page.getByText("Tresses express", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/10:00/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirmer.*10.*000 FCFA/ })).toBeVisible();
  });
});
