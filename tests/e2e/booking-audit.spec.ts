import { expect, test, type Page, type Route } from "@playwright/test";

const api = "https://audit.supabase.test";
const providerId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const otherClientId = "44444444-4444-4444-8444-444444444444";
const bookingId = "55555555-5555-4555-8555-555555555555";

type AuditState = {
  bookingCreated: boolean;
  currentRole: "client" | "provider" | "other";
  selectedSlot: string;
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
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-320", "Mesure de référence exécutée sur le plus petit écran supporté.");
    await page.setViewportSize({ width: 320, height: 740 });
  });

  test("termine une réservation en 8 actions et conserve le choix après connexion", async ({ page }) => {
    const state: AuditState = { bookingCreated: false, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    const startedAt = Date.now();
    let actions = 0;
    await page.goto("/");
    await page.locator(".photo-category-grid button").filter({ hasText: "Tresses" }).click(); actions += 1;
    await page.locator(".premium-provider-card").click(); actions += 1;
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

  test("retire un créneau réservé et affiche la réservation aux deux participants", async ({ page }) => {
    const state: AuditState = { bookingCreated: true, currentRole: "client", selectedSlot: "" };
    await mockSupabase(page, state);
    await page.goto("/");
    await page.locator(".photo-category-grid button").filter({ hasText: "Tresses" }).click();
    await page.locator(".premium-provider-card").click();
    await page.getByRole("button", { name: /Tresses express/ }).click();
    await expect(page.getByRole("button", { name: "10:00" })).toHaveCount(0);
    await page.getByRole("button", { name: "Fermer" }).click();
    await page.getByRole("button", { name: "Retour" }).click();
    await page.getByRole("button", { name: "Profil" }).click();
    await signIn(page, "client-audit@example.test");
    await expect(page.getByText("Tresses express", { exact: true })).toBeVisible();
    await expect(page.getByText(/10.*000 XOF/)).toBeVisible();

    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.getByRole("button", { name: "Profil" }).click();
    await signIn(page, "provider-audit@example.test");
    await expect(page.getByText("Tresses express", { exact: true })).toBeVisible();
    await expect(page.getByText(/Chez le professionnel/)).toBeVisible();
  });

  test("isole la réservation d’un autre utilisateur", async ({ page }) => {
    const state: AuditState = { bookingCreated: true, currentRole: "other", selectedSlot: "" };
    await mockSupabase(page, state);
    await page.goto("/");
    await page.getByRole("button", { name: "Ouvrir mon compte" }).click();
    await signIn(page, "other-audit@example.test");
    await expect(page.getByText("Aucune réservation pour le moment.")).toBeVisible();
    const response = await page.evaluate(async ({ id, endpoint }) => fetch(`${endpoint}/rest/v1/bookings?id=eq.${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled_by_client" }),
    }).then((result) => result.status), { id: bookingId, endpoint: api });
    expect(response).toBe(403);
  });
});
