import { expect, test } from "@playwright/test";

const supabaseOrigin = process.env.MATA_SUPABASE_FIXTURE_ORIGIN ?? "https://audit.supabase.co";
const appOrigin = `http://127.0.0.1:${process.env.MATA_PLAYWRIGHT_PORT ?? 3160}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("mata-launch-welcome", "done"));
});

test.beforeEach(async ({ page }) => {
  await page.route(`${supabaseOrigin}/auth/v1/authorize**`, (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/auth/providers", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ google: true }) }));
  await page.route(`${supabaseOrigin}/rest/v1/categories**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tresses", slug: "tresses", icon: "≋", sort_order: 1 },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Onglerie", slug: "onglerie", icon: "◇", sort_order: 2 },
  ]) }));
  await page.route(`${supabaseOrigin}/rest/v1/provider_profiles**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
    profile_id: "11111111-1111-4111-8111-111111111111", business_name: "Atelier Tresses", city: "Dakar", service_mode: "salon", average_rating: 4.8, review_count: 12, verified_at: "2026-01-01T00:00:00Z", cover_url: null,
    provider_services: [
      { id: "22222222-2222-4222-8222-222222222222", title: "Tresses collées", duration_minutes: 90, price_amount: 10000, services: { name: "Tresses collées", categories: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tresses" } } },
      { id: "33333333-3333-4333-8333-333333333333", title: "Pose gel", duration_minutes: 60, price_amount: 8000, services: { name: "Pose gel", categories: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Onglerie" } } },
    ],
  }]) }));
  await page.route(`${supabaseOrigin}/rest/v1/promotions**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  page.on("pageerror", (error) => { throw error; });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) throw new Error(message.text());
  });
});

test("legacy Explorer URLs redirect to Inspiration and preserve the selected category", async ({ page }) => {
  await page.goto("/discover?screen=results&category=Tresses");
  await expect(page).toHaveURL(/\\/?search=1&applied=1&category=Tresses/);
  await expect(page.getByText("INSPIRATION", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Explorer" })).toHaveCount(0);
  await page.goto("/app/discover?screen=results&category=Tresses");
  await expect(page).toHaveURL(/\\/?search=1&applied=1&category=Tresses/);
  await expect(page.getByText("INSPIRATION", { exact: true })).toBeVisible();
});

test("authentication has no fake preview mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: /^(?:Profil|Ouvrir mon compte|Se connecter à MATA Beauty)$/ }).click();
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeEnabled();
  await expect(page.getByRole("dialog")).not.toContainText("aperçu");
});

test("registration requires explicit legal consent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: /^(?:Profil|Ouvrir mon compte|Se connecter à MATA Beauty)$/ }).click();
  await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Créer votre compte" })).toBeVisible();
  const consent = page.getByRole("checkbox", { name: "Accepter les conditions générales et la politique de confidentialité" });
  await expect(consent).not.toBeChecked();
  await consent.check();
  await expect(consent).toBeChecked();
});

test("mobile bottom navigation opens Inspiration search without horizontal overflow", async ({ page }) => {
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

test("Inspiration swipes vertically with one active player, filters and an eight-item batch", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.addEventListener("error", (event) => { if (event.target instanceof HTMLVideoElement) event.stopImmediatePropagation(); }, true);
    HTMLMediaElement.prototype.play = function () { this.dataset.playing = "true"; this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { this.dataset.playing = "false"; this.dispatchEvent(new Event("pause")); };
  });
  let requestedBatch = "";
  await page.route(`${supabaseOrigin}/*.mp4`, (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from([0, 0, 0, 20, 102, 116, 121, 112]) }));
  await page.route(`${supabaseOrigin}/rest/v1/rpc/get_available_slots**`, (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([{ slot_start: "2026-10-17T10:00:00+00:00" }]),
  }));
  await page.route(`${supabaseOrigin}/rest/v1/rpc/record_post_booking_click**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route(`${supabaseOrigin}/rest/v1/rpc/record_product_event**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route(`${supabaseOrigin}/rest/v1/rpc/record_video_view**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route(`${supabaseOrigin}/rest/v1/provider_profiles**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
    profile_id: "11111111-1111-4111-8111-111111111111", business_name: "Atelier Tresses", city: "Dakar", service_mode: "salon",
    average_rating: 4.8, review_count: 12, verified_at: "2026-01-01T00:00:00Z", cover_url: null, status: "approved",
    provider_services: [{ id: "22222222-2222-4222-8222-222222222222", title: "Tresses collées", duration_minutes: 90, price_amount: 10000,
      business_id: "33333333-3333-4333-8333-333333333333", businesses: { address: "", city: "Dakar", area: "", latitude: null, longitude: null },
      services: { name: "Tresses", categories: { name: "Tresses" } } }],
  }]) }));
  await page.route(`${supabaseOrigin}/rest/v1/provider_services**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(`${supabaseOrigin}/rest/v1/social_feed**`, (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("select") === "*") requestedBatch = query.get("limit") ?? "";
    const base = {
      author_id: "11111111-1111-4111-8111-111111111111", thumbnail_url: null, duration_seconds: 18,
      view_count: 120, like_count: 32, comment_count: 4, save_count: 7, share_count: 2,
      published_at: new Date().toISOString(), business_name: "Atelier Tresses", slug: "atelier-tresses", city: "Dakar",
      verified_at: "2026-01-01T00:00:00Z", avatar_url: null, cover_url: null, is_sponsored: false,
      provider_service_id: "22222222-2222-4222-8222-222222222222", service_title: "Tresses collées",
      duration_minutes: 90, price_amount: 10000, currency: "XOF", average_rating: 4.8, review_count: 12, hashtags: ["tresses", "dakar"],
    };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { ...base, id: "66666666-6666-4666-8666-666666666666", caption: "Première transformation", video_url: "https://audit.supabase.co/one.mp4" },
      { ...base, id: "77777777-7777-4777-8777-777777777777", caption: "Deuxième transformation", video_url: "https://audit.supabase.co/two.mp4", published_at: new Date(Date.now()-1000).toISOString() },
      { ...base, id: "88888888-8888-4888-8888-888888888888", caption: "Manucure gel", provider_service_id: "33333333-3333-4333-8333-333333333333", service_title: "Pose gel", video_url: "https://audit.supabase.co/nails.mp4", published_at: new Date(Date.now()-2000).toISOString() },
    ]) });
  });
  await page.route("**/api/public/social-posts/*/media", (route) => {
    const postId = new URL(route.request().url()).pathname.split("/").at(-2);
    const mediaName = postId === "66666666-6666-4666-8666-666666666666" ? "one.mp4" : "two.mp4";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ videoUrl: `${supabaseOrigin}/${mediaName}`, thumbnailUrl: null }) });
  });
  await page.goto("/");
  const feed = page.locator(".social-feed");
  await expect(page.locator(".social-video-card")).toHaveCount(3, { timeout: 15_000 });
  expect(requestedBatch).toBe("8");
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.getByRole("button", { name: "Réserver", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Réserver", exact: true })).toBeVisible();
  await expect(page.getByText("Tresses collées", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  const feedShell = page.locator(".social-feed-shell");
  await expect(feedShell).toHaveAttribute("data-feed-mode", "immersive");
  await page.getByRole("button", { name: "Afficher le mode Premium" }).click();
  await expect(feedShell).toHaveAttribute("data-feed-mode", "premium");
  const premiumPanel = page.locator(".feed-premium-panel").first();
  await expect(premiumPanel.getByRole("button", { name: "Atelier Tresses" })).toBeVisible();
  await expect(premiumPanel.getByRole("heading", { name: "Tresses collées" })).toBeVisible();
  await expect(premiumPanel.getByText(/10\s?000/)).toBeVisible();
  await expect(premiumPanel.getByText(/Prochain créneau/)).toBeVisible();
  const panelLayout = await premiumPanel.evaluate((panel) => {
    const header = document.querySelector(".social-feed-header")?.getBoundingClientRect();
    const feed = document.querySelector(".social-feed");
    const panelBox = panel.getBoundingClientRect();
    const bottomNav = document.querySelector(".premium-bottom-nav")?.getBoundingClientRect();
    const card = panel.closest(".social-video-card");
    return { panelTop: panelBox.top, headerBottom: header?.bottom ?? 0, panelBottom: panelBox.bottom, navTop: bottomNav?.top ?? window.innerHeight,
      feedPadding: feed ? getComputedStyle(feed).paddingTop : "missing", cardHeight: card?.getBoundingClientRect().height, viewportWidth: window.innerWidth,
      panelPosition: getComputedStyle(panel).position, display: getComputedStyle(panel).display };
  });
  expect(panelLayout.panelTop, JSON.stringify(panelLayout)).toBeGreaterThanOrEqual(panelLayout.headerBottom);
  expect(panelLayout.panelBottom, JSON.stringify(panelLayout)).toBeLessThanOrEqual(panelLayout.navTop);
  const actionLayout = await premiumPanel.getByRole("button", { name: "Réserver", exact: true }).evaluate((button) => ({
    buttonBottom: button.getBoundingClientRect().bottom, panelBottom: button.closest(".feed-premium-panel")!.getBoundingClientRect().bottom,
    panelHeight: button.closest(".feed-premium-panel")!.getBoundingClientRect().height, viewportHeight: window.innerHeight,
  }));
  expect(actionLayout.buttonBottom, JSON.stringify(actionLayout)).toBeLessThanOrEqual(actionLayout.panelBottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("feed-premium.png") });
  await premiumPanel.getByRole("button", { name: "Réserver", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Réserver", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.getByRole("button", { name: "Afficher le mode immersif" }).click();
  await expect(feedShell).toHaveAttribute("data-feed-mode", "immersive");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("mata-social-feed-mode"))).toBe("immersive");
  await page.getByRole("button", { name: "Mettre la vidéo en pause" }).first().click();
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(0);
  await page.getByRole("button", { name: "Lire la vidéo" }).first().click();
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.getByRole("button", { name: "Activer le son" }).first().click();
  await expect(page.getByRole("button", { name: "Couper le son" }).first()).toBeVisible();
  await feed.evaluate((node) => node.scrollTo({ top: node.clientHeight, behavior: "auto" }));
  await page.locator(".social-video-card video").nth(1).dispatchEvent("canplay");
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await expect(page.locator(".social-video-card video").first()).not.toHaveAttribute("src", /.+/);
  await page.getByRole("button", { name: "Tendances", exact: true }).click();
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  expect(await feed.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await feed.evaluate((node) => node.scrollTo({ top: 0, behavior: "auto" }));
  await page.locator(".social-video-card video").first().dispatchEvent("canplay");
  await expect.poll(() => page.locator('video[data-playing="true"]').count()).toBe(1);
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Que souhaitez-vous découvrir ?" });
  await dialog.locator("select").first().selectOption("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  await dialog.getByLabel("Ville, quartier ou pays").fill("Dakar");
  await dialog.getByRole("button", { name: "Afficher les vidéos", exact: true }).click();
  await expect(page.locator(".social-video-card")).toHaveCount(2);
  await expect(page.locator(".social-video-card").filter({ hasText: "Manucure gel" })).toHaveCount(0);
  await page.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(page.locator(".social-video-card")).toHaveCount(3);
});

test("Google login starts a real OAuth request with a fixed callback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: /^(?:Profil|Ouvrir mon compte|Se connecter à MATA Beauty)$/ }).click();
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
  await page.getByLabel("Adresse e-mail").fill("client@example.test");
  const recoveryRequest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/recover"));
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await recoveryRequest;
});

test("invalid OAuth callbacks fail closed without an open redirect", async ({ page }) => {
  await page.goto("/auth/callback?next=https%3A%2F%2Fevil.example%2Fsteal");
  await expect(page.getByText("Retour Google invalide.", { exact: true })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(appOrigin);
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
