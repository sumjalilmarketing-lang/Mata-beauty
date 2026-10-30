import { expect, test } from "@playwright/test";

// Keep route fixtures deterministic across WebKit and Chromium; these tests
// exercise application flows rather than the separately tested PWA worker.
test.use({ serviceWorkers: "block" });

const testSupabaseOrigin = process.env.MATA_SUPABASE_FIXTURE_ORIGIN ?? "https://audit.supabase.co";
const testAppOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("mata-launch-welcome", "done"));
});

test.beforeEach(async ({ page }) => {
  await page.route(`${testSupabaseOrigin}/auth/v1/authorize**`, (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/auth/providers", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ google: true }) }));
  await page.route(`${testSupabaseOrigin}/rest/v1/categories**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tresses", slug: "tresses", icon: "≋", sort_order: 1 }]) }));
  await page.route(`${testSupabaseOrigin}/rest/v1/provider_profiles**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
    profile_id: "11111111-1111-4111-8111-111111111111", business_name: "Atelier Tresses", city: "Dakar", service_mode: "salon", average_rating: 4.8, review_count: 12, verified_at: "2026-01-01T00:00:00Z", cover_url: null,
    provider_services: [{ id: "22222222-2222-4222-8222-222222222222", title: "Tresses collées", duration_minutes: 90, price_amount: 10000, services: { name: "Tresses collées", categories: { name: "Tresses" } } }],
  }]) }));
  // Mock the catalogue enrichment as well; audit.supabase.co is deliberately
  // non-routable, so leaving these reads unmocked leaves the UI in loading.
  await page.route(`${testSupabaseOrigin}/rest/v1/provider_services**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(`${testSupabaseOrigin}/rest/v1/social_feed**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(`${testSupabaseOrigin}/rest/v1/promotions**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(`${testSupabaseOrigin}/rest/v1/rpc/**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: route.request().url().includes("get_available_slots") ? "[]" : "null" }));
  page.on("pageerror", (error) => { throw error; });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) throw new Error(message.text());
  });
});

test("legacy Explorer URLs return to Inspiration and keep the selected search", async ({ page }) => {
  await page.goto("/discover?screen=results&category=Tresses");
  await expect(page).toHaveURL(/\/?search=1&applied=1&category=Tresses/);
  await expect(page.getByText("INSPIRATION", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Explorer" })).toHaveCount(0);
  await page.goto("/app/discover?screen=results&category=Tresses");
  await expect(page).toHaveURL(/\/?search=1&applied=1&category=Tresses/);
  await expect(page.getByText("INSPIRATION", { exact: true })).toBeVisible();
});

const profileNavButton = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: /^(Profil|Se connecter à MATA Beauty)$/ });

test("authentication has no fake preview mode", async ({ page }) => {
  await page.goto("/");
  await profileNavButton(page).click();
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeEnabled();
  await expect(page.getByRole("dialog")).not.toContainText("aperçu");
});

test("registration requires explicit legal consent", async ({ page }) => {
  await page.goto("/");
  await profileNavButton(page).click();
  await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Créer votre compte" })).toBeVisible();
  const consent = page.getByRole("checkbox", { name: "Accepter les conditions générales et la politique de confidentialité" });
  await expect(consent).not.toBeChecked();
  await consent.check();
  await expect(consent).toBeChecked();
});

test("international registration sends the selected country, locale, phone and location to Auth", async ({ page }) => {
  let signupMetadata: Record<string, unknown> | null = null;
  await page.route(`${testSupabaseOrigin}/auth/v1/signup**`, async route => {
    const payload = route.request().postDataJSON() as { data?: Record<string, unknown>; email?: string };
    signupMetadata = payload.data ?? null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      user: { id: "88888888-8888-4888-8888-888888888888", aud: "authenticated", role: "authenticated", email: payload.email, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: signupMetadata, identities: [] },
      session: null,
    }) });
  });
  await page.goto("/");
  await profileNavButton(page).click();
  await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
  await page.getByLabel("Nom complet").fill("Compte test Madrid");
  const country = page.getByLabel("Pays de résidence");
  await expect(country).toHaveValue("");
  await country.selectOption("ES");
  await page.getByLabel("Région ou État").fill("Communauté de Madrid");
  await page.getByLabel("Ville", { exact: true }).fill("Madrid");
  await page.getByLabel("Téléphone international").fill("+34600000000");
  await page.getByLabel("Langue préférée").selectOption("es");
  await page.getByLabel("Adresse e-mail").fill("madrid@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("MataMadrid2026!");
  await page.getByLabel("Confirmer le mot de passe").fill("MataMadrid2026!");
  await page.getByRole("checkbox", { name: "Accepter les conditions générales et la politique de confidentialité" }).check();
  await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
  await expect.poll(() => signupMetadata).not.toBeNull();
  expect(signupMetadata).toMatchObject({ country_code: "ES", region: "Communauté de Madrid", city: "Madrid", phone_e164: "+34600000000", locale: "es-ES" });
  await expect(page.getByRole("dialog")).toContainText("Consultez votre boîte e-mail");
});

test("mobile bottom navigation works without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Navigation de l’application" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Inspiration" })).toBeVisible();
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Que souhaitez-vous découvrir ?" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer la recherche" }).click();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});

test("Inspiration country filter uses public provider ISO codes", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { this.dataset.playing = "true"; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { this.dataset.playing = "false"; };
    // This test drives media events directly; avoid turning a deliberately
    // synthetic MP4 response into a browser-decoder error before assertions.
    Object.defineProperty(HTMLVideoElement.prototype, "src", {
      configurable: true,
      get() { return this.dataset.testMediaSrc ?? ""; },
      set(value: string) { this.dataset.testMediaSrc = value; },
    });
    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (this instanceof HTMLMediaElement && name.toLowerCase() === "src") {
        this.dataset.testMediaSrc = value;
        return;
      }
      nativeSetAttribute.call(this, name, value);
    };
    HTMLMediaElement.prototype.load = function () {};
    // This test drives media events directly; avoid turning a deliberately
    // synthetic MP4 response into a browser-decoder error before assertions.
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() { return this.dataset.testMediaSrc ?? ""; },
      set(value: string) { this.dataset.testMediaSrc = value; },
    });
    HTMLMediaElement.prototype.load = function () {};
  });
  const providerFrance = "11111111-1111-4111-8111-111111111111";
  const providerSenegal = "44444444-4444-4444-8444-444444444444";
  const serviceFrance = "22222222-2222-4222-8222-222222222222";
  const serviceSenegal = "55555555-5555-4555-8555-555555555555";
  await page.route(`${testSupabaseOrigin}/rest/v1/provider_profiles**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { profile_id: providerFrance, business_name: "Studio Paris", city: "Paris", country_code: "FR", timezone: "Europe/Paris", service_mode: "salon", average_rating: 0, review_count: 0, verified_at: null, cover_url: null, provider_services: [{ id: serviceFrance, title: "Manucure", duration_minutes: 60, price_amount: 30, currency: "EUR", services: { name: "Manucure", categories: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Onglerie" } } }] },
    { profile_id: providerSenegal, business_name: "Studio Dakar", city: "Dakar", country_code: "SN", timezone: "Africa/Dakar", service_mode: "salon", average_rating: 0, review_count: 0, verified_at: null, cover_url: null, provider_services: [{ id: serviceSenegal, title: "Tresses", duration_minutes: 60, price_amount: 10000, currency: "XOF", services: { name: "Tresses", categories: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Coiffure" } } }] },
  ]) }));
  await page.route(`${testSupabaseOrigin}/rest/v1/social_feed**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { id: "66666666-6666-4666-8666-666666666666", author_id: providerFrance, caption: "Manucure Paris", video_url: `${testAppOrigin}/paris.mp4`, thumbnail_url: null, duration_seconds: 10, view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0, published_at: new Date().toISOString(), business_name: "Studio Paris", slug: "studio-paris", city: "Paris", verified_at: null, avatar_url: null, cover_url: null, is_sponsored: false, provider_service_id: serviceFrance, service_title: "Manucure", duration_minutes: 60, price_amount: 30, currency: "EUR", average_rating: 0, review_count: 0, hashtags: [], post_type: "video" },
    { id: "77777777-7777-4777-8777-777777777777", author_id: providerSenegal, caption: "Tresses Dakar", video_url: `${testAppOrigin}/dakar.mp4`, thumbnail_url: null, duration_seconds: 10, view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0, published_at: new Date(Date.now() - 1000).toISOString(), business_name: "Studio Dakar", slug: "studio-dakar", city: "Dakar", verified_at: null, avatar_url: null, cover_url: null, is_sponsored: false, provider_service_id: serviceSenegal, service_title: "Tresses", duration_minutes: 60, price_amount: 10000, currency: "XOF", average_rating: 0, review_count: 0, hashtags: [], post_type: "video" },
  ]) }));

  await page.goto("/");
  await expect(page.locator(".social-video-card")).toHaveCount(2, { timeout: 15000 });
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.getByLabel("Pays", { exact: true }).selectOption("FR");
  await page.getByRole("button", { name: "Afficher les vidéos", exact: true }).click();
  await expect(page.locator(".social-video-card")).toHaveCount(1);
  await expect(page.locator(".social-video-card")).toContainText("Studio Paris");
  await expect(page.locator(".social-video-card")).not.toContainText("Studio Dakar");
});

test("primary mobile navigation keeps comfortable touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const buttons = page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button");
  await expect(buttons).toHaveCount(4);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box, "Le bouton principal doit être visible").not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(button).toHaveAccessibleName(/\S/);
  }
});

test("Inspiration swipes vertically with one active player, filters and an eight-item batch", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("error", (event) => {
      if (event.target instanceof HTMLVideoElement && (event.isTrusted || window.localStorage.getItem("suppress-test-media-errors") === "true")) event.stopImmediatePropagation();
    }, true);
    HTMLMediaElement.prototype.play = function () { this.dataset.playing = "true"; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { this.dataset.playing = "false"; };
  });
  const requestedBatches: string[] = [];
  await page.route(`${testAppOrigin}/*.mp4`, (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]) }));
  await page.route(`${testSupabaseOrigin}/rest/v1/rpc/get_available_slots**`, (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([{ slot_start: "2026-08-17T10:00:00+00:00" }]),
  }));
  await page.route(`${testSupabaseOrigin}/rest/v1/rpc/record_post_booking_click**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route(`${testSupabaseOrigin}/rest/v1/rpc/record_product_event**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route(`${testSupabaseOrigin}/rest/v1/rpc/record_video_view**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route(`${testSupabaseOrigin}/rest/v1/categories**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tresses", slug: "tresses", icon: "≋", sort_order: 1 },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Onglerie", slug: "onglerie", icon: "◇", sort_order: 2 },
  ]) }));
  await page.route(`${testSupabaseOrigin}/rest/v1/provider_profiles**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
    profile_id: "11111111-1111-4111-8111-111111111111", business_name: "Atelier Tresses", city: "Dakar", service_mode: "salon", average_rating: 4.8, review_count: 12, verified_at: "2026-01-01T00:00:00Z", cover_url: null, latitude: 14.7167, longitude: -17.4677,
    provider_services: [
      { id: "22222222-2222-4222-8222-222222222222", title: "Tresses collées", duration_minutes: 90, price_amount: 10000, services: { name: "Tresses collées", categories: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tresses" } } },
      { id: "33333333-3333-4333-8333-333333333333", title: "Pose gel", duration_minutes: 60, price_amount: 8000, services: { name: "Pose gel", categories: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Onglerie" } } },
    ],
  }]) }));
  await page.route(`${testSupabaseOrigin}/rest/v1/social_feed**`, (route) => {
    requestedBatches.push(new URL(route.request().url()).searchParams.get("limit") ?? "");
    const base = {
      author_id: "11111111-1111-4111-8111-111111111111", thumbnail_url: null, duration_seconds: 18,
      view_count: 120, like_count: 32, comment_count: 4, save_count: 7, share_count: 2,
      published_at: new Date().toISOString(), business_name: "Atelier Tresses", slug: "atelier-tresses", city: "Dakar",
      verified_at: "2026-01-01T00:00:00Z", avatar_url: null, cover_url: null, is_sponsored: false,
      provider_service_id: "22222222-2222-4222-8222-222222222222", service_title: "Tresses collées",
      duration_minutes: 90, price_amount: 10000, currency: "XOF", average_rating: 4.8, review_count: 12, hashtags: ["tresses", "dakar"],
    };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { ...base, id: "66666666-6666-4666-8666-666666666666", caption: "Première transformation", video_url: `${testAppOrigin}/one.mp4` },
      { ...base, id: "77777777-7777-4777-8777-777777777777", caption: "Deuxième transformation", video_url: `${testAppOrigin}/two.mp4`, published_at: new Date(Date.now()-1000).toISOString() },
      { ...base, id: "88888888-8888-4888-8888-888888888888", caption: "Manucure gel", provider_service_id: "33333333-3333-4333-8333-333333333333", service_title: "Pose gel", video_url: `${testAppOrigin}/nails.mp4`, published_at: new Date(Date.now()-2000).toISOString() },
    ]) });
  });
  await page.goto("/");
  const feed = page.locator(".social-feed");
  await expect(page.locator(".social-video-card")).toHaveCount(3, { timeout: 15_000 });
  expect(requestedBatches).toContain("8");
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await expect(page.locator(".social-video-card").first().getByRole("button", { name: "Voir les disponibilités", exact: true }).first()).toBeVisible();
  const activeCard = page.locator(".social-video-card").filter({ has: page.locator('video[data-playing="true"]') }).first();
  await activeCard.getByRole("button", { name: "Réserver", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Réserver", exact: true })).toBeVisible();
  await expect(page.getByText("Tresses collées", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Mettre la vidéo en pause" }).first().click();
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(0);
  await page.getByRole("button", { name: "Lire la vidéo" }).first().click();
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.getByRole("button", { name: "Activer le son" }).first().click();
  await expect(page.getByRole("button", { name: "Couper le son" }).first()).toBeVisible();
  await feed.evaluate((node) => node.scrollTo({ top: node.clientHeight, behavior: "auto" }));
  await page.locator(".social-video-card video").nth(1).dispatchEvent("canplay");
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await expect(page.locator(".social-video-card").first().locator("video")).toHaveCount(0);
  await expect(page.locator(".social-video-card").first().locator(".video-poster-placeholder")).toHaveCount(1);
  await expect(page.locator(".social-video-card").first()).toHaveAttribute("data-video-state", "waiting");
  await expect(page.locator(".video-fallback")).toHaveCount(0);
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  expect(await feed.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await feed.evaluate((node) => node.scrollTo({ top: 0, behavior: "auto" }));
  await page.locator(".social-video-card video").first().dispatchEvent("canplay");
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.getByRole("dialog").locator("select").first().selectOption("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await page.getByLabel("Ville, quartier ou pays").fill("Dakar");
  await page.getByRole("button", { name: "Afficher les vidéos", exact: true }).click();
  await expect(page.locator(".social-video-card")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Filtres du feed" })).toHaveCount(0);
  await expect(page.locator(".social-video-card").filter({ hasText: "Manucure gel" })).toHaveCount(0);
  await page.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(page.locator(".social-video-card")).toHaveCount(3);
});

test("video states distinguish waiting, loading, ready and confirmed errors, with signed URL retry (simulated media)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.addEventListener("error", (event) => {
      if (event.target instanceof HTMLVideoElement && (event.isTrusted || window.localStorage.getItem("suppress-test-media-errors") === "true")) event.stopImmediatePropagation();
    }, true);
    HTMLMediaElement.prototype.play = function () { this.dataset.playing = "true"; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { this.dataset.playing = "false"; };
    // This scenario dispatches media lifecycle events itself. Keep its
    // synthetic byte fixture out of the browser's native decoder.
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() { return this.dataset.testMediaSrc ?? ""; },
      set(value: string) { this.dataset.testMediaSrc = value; },
    });
    HTMLMediaElement.prototype.load = function () {};
    const nativeFetch = window.fetch.bind(window);
    const retryCounts: Record<string, number> = {};
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const match = url.match(/\/api\/public\/social-posts\/([0-9a-f-]+)\/media/i);
      if (!match) return nativeFetch(input, init);
      const postId = match[1];
      retryCounts[postId] = (retryCounts[postId] ?? 0) + 1;
      window.sessionStorage.setItem("video-retry-counts", JSON.stringify(retryCounts));
      if (postId.startsWith("8888")) await new Promise((resolve) => window.setTimeout(resolve, 400));
      if (postId.startsWith("8888") || retryCounts[postId] === 2) {
        return new Response(JSON.stringify({ error: "temporary media signing failure" }), { status: 503, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ videoUrl: "https://audit.supabase.co/retry.mp4", thumbnailUrl: null }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  });
  await page.route(`${testSupabaseOrigin}/*.mp4`, (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]) }));
  await page.route(`${testSupabaseOrigin}/rest/v1/social_feed**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    {
      id: "66666666-6666-4666-8666-666666666666", author_id: "11111111-1111-4111-8111-111111111111",
      caption: "État du lecteur", business_name: "Atelier Tresses", slug: "atelier-tresses", city: "Dakar",
      video_url: `${testAppOrigin}/first.mp4`, thumbnail_url: "/brand/icon-192.png",
      media_urls: [`${testAppOrigin}/first.mp4`], published_at: new Date().toISOString(), view_count: 0,
      like_count: 0, comment_count: 0, save_count: 0, share_count: 0, duration_seconds: 12,
      average_rating: 0, review_count: 0, provider_service_id: null,
    },
    {
      id: "77777777-7777-4777-8777-777777777777", author_id: "11111111-1111-4111-8111-111111111111",
      caption: "Vidéo hors écran", business_name: "Atelier Tresses", slug: "atelier-tresses", city: "Dakar",
      video_url: `${testAppOrigin}/second.mp4`, thumbnail_url: "/brand/icon-192.png",
      media_urls: [`${testAppOrigin}/second.mp4`], published_at: new Date(Date.now() - 1000).toISOString(), view_count: 0,
      like_count: 0, comment_count: 0, save_count: 0, share_count: 0, duration_seconds: 12,
      average_rating: 0, review_count: 0, provider_service_id: null,
    },
    {
      id: "88888888-8888-4888-8888-888888888888", author_id: "11111111-1111-4111-8111-111111111111",
      caption: "Vidéo en attente", business_name: "Atelier Tresses", slug: "atelier-tresses", city: "Dakar",
      video_url: "", thumbnail_url: "/brand/icon-192.png",
      media_urls: [], published_at: new Date(Date.now() - 2000).toISOString(), view_count: 0,
      like_count: 0, comment_count: 0, save_count: 0, share_count: 0, duration_seconds: 12,
      average_rating: 0, review_count: 0, provider_service_id: null,
    },
  ]) }));
  await page.goto("/");
  await expect(page.locator(".social-video-card")).toHaveCount(3);
  await expect(page.locator(".social-video-card").nth(2).locator("video")).toHaveCount(0);
  await expect(page.locator(".social-video-card").nth(2).locator(".video-poster-placeholder")).toHaveCount(1);
  await expect(page.locator(".video-fallback")).toHaveCount(0);
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.locator(".social-video-card").first().locator("video").dispatchEvent("waiting");
  await expect(page.locator(".social-video-card").first()).toHaveAttribute("data-video-state", "loading");
  await page.locator(".social-video-card").first().locator("video").dispatchEvent("canplay");
  await expect(page.locator(".social-video-card").first()).toHaveAttribute("data-video-state", "ready");

  const firstVideo = page.locator(".social-video-card").first().locator("video");
  await firstVideo.dispatchEvent("error");
  await expect.poll(() => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("video-retry-counts") ?? "{}")["66666666-6666-4666-8666-666666666666"])).toBe(1);
  await expect(page.locator(".social-video-card").first().getByRole("alert")).toHaveCount(0);
  await firstVideo.dispatchEvent("canplay");
  await expect(page.locator(".social-video-card").first()).toHaveAttribute("data-video-state", "ready");
  await firstVideo.dispatchEvent("error");
  await expect(page.locator(".social-video-card").first().getByRole("alert")).toContainText("Cette vidéo ne peut pas être lue");
  const retryButton = page.locator(".social-video-card").first().getByRole("button", { name: "Réessayer", exact: true });
  await expect(retryButton).toBeVisible();
  await page.evaluate(() => window.localStorage.setItem("suppress-test-media-errors", "true"));
  await expect(retryButton).toBeEnabled();
  await retryButton.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("video-retry-counts") ?? "{}")["66666666-6666-4666-8666-666666666666"])).toBe(3);

  const feed = page.locator(".social-feed");
  await feed.evaluate((node) => node.scrollTo({ top: node.clientHeight * 2, behavior: "auto" }));
  await expect(page.locator(".social-video-card").nth(2).getByRole("status")).toContainText("Chargement de la vidéo");
  await expect(page.locator(".social-video-card").nth(2)).toHaveAttribute("data-video-state", "loading");
  await expect(page.locator(".social-video-card").nth(2).locator(".video-fallback")).toHaveCount(0);
  await expect(page.locator(".social-video-card").nth(2).getByRole("status")).toContainText("Vidéo en attente de chargement");
  await expect(page.locator(".social-video-card").nth(2)).toHaveAttribute("data-video-state", "waiting");
  await expect(page.locator(".social-video-card").nth(2).getByRole("button", { name: "Réessayer", exact: true })).toBeVisible();
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(0);
  await feed.evaluate((node) => node.scrollTo({ top: node.clientHeight, behavior: "auto" }));
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.reload();
  await expect(page.locator(".social-feed-shell")).toBeVisible();
  await expect(page.locator(".social-video-card")).toHaveCount(3);
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
});

test("Google login starts a real OAuth request with a fixed callback", async ({ page }) => {
  await page.goto("/");
  await profileNavButton(page).click();
  const google = page.getByRole("button", { name: "Continuer avec Google", exact: true });
  await expect(google).toBeEnabled();
  const authorizeRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/auth/v1/authorize");
  await google.click();
  const oauthUrl = new URL((await authorizeRequest).url());
  expect(oauthUrl.searchParams.get("provider")).toBe("google");
  const redirect = new URL(oauthUrl.searchParams.get("redirect_to") ?? "https://invalid.test");
  expect(redirect.pathname).toBe("/auth/callback");
  expect(redirect.searchParams.get("intent")).toBe("client");
  expect(redirect.searchParams.get("next")).toBe("/app/profile");
});

test("a protected destination survives the authentication handoff", async ({ page }) => {
  await page.goto("/?connexion=requise&returnTo=%2Fpro%2Fstudio");
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  const authorizeRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/auth/v1/authorize");
  await page.getByRole("button", { name: "Continuer avec Google", exact: true }).click();
  const oauthUrl = new URL((await authorizeRequest).url());
  const redirect = new URL(oauthUrl.searchParams.get("redirect_to") ?? "https://invalid.test");
  expect(redirect.searchParams.get("intent")).toBe("professional");
  expect(redirect.searchParams.get("next")).toBe("/pro/studio");
});

test("password recovery does not require the old password", async ({ page }) => {
  await page.goto("/?auth=reset");
  await expect(page.getByRole("heading", { name: "Mot de passe oublié" })).toBeVisible();
  await page.getByLabel("Adresse e-mail").fill("client@example.com");
  const recoveryRequest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/recover"));
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await recoveryRequest;
});

test("invalid OAuth callbacks fail closed without an open redirect", async ({ page }) => {
  await page.goto("/auth/callback?next=https%3A%2F%2Fevil.example%2Fsteal");
  await expect(page.getByText("Retour Google invalide.", { exact: true })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(new URL(String(test.info().project.use.baseURL)).origin);
  expect(new URL(page.url()).hostname).not.toBe("evil.example");
});

test("professional Google registration keeps a non-administrative intent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Publier une vidéo" }).click();
  const authorizeRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/auth/v1/authorize");
  await page.getByRole("button", { name: "Continuer avec Google", exact: true }).click();
  const oauthUrl = new URL((await authorizeRequest).url());
  const redirect = new URL(oauthUrl.searchParams.get("redirect_to") ?? "https://invalid.test");
  expect(redirect.searchParams.get("intent")).toBe("professional");
  expect(redirect.searchParams.get("intent")).not.toBe("admin");
});
