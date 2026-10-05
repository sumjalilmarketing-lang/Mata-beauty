import { expect, test } from "@playwright/test";

// Layout/interaction tests with simulated catalogue data; not proof of real media playback.
test.beforeEach(async ({ page }) => {
  await page.route("https://audit.supabase.co/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const rows = path.endsWith("/social_feed") ? [0, 1, 2].map((index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      author_id: "11111111-1111-4111-8111-111111111111",
      caption: `Inspiration ${index + 1}`, business_name: "Atelier test", slug: "atelier-test", city: "Dakar",
      post_type: "photo", video_url: "/brand/icon-192.png", media_urls: ["/brand/icon-192.png"],
      published_at: new Date(Date.now() - index * 1000).toISOString(),
      view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0,
      duration_seconds: 0, average_rating: 0, review_count: 0,
      provider_service_id: `22222222-2222-4222-8222-22222222222${index}`,
    })) : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
});

test("cached feed can paginate during a slow initial refresh without repeating page one (simulated network)", async ({ page }) => {
  let slowRefresh = false;
  const cursors: boolean[] = [];
  const rows = Array.from({ length: 9 }, (_, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    author_id: "11111111-1111-4111-8111-111111111111",
    caption: `Publication pagination ${index + 1}`, business_name: "Atelier test", slug: "atelier-test", city: "Dakar",
    post_type: "photo", video_url: "/brand/icon-192.png", media_urls: ["/brand/icon-192.png"],
    view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0,
    duration_seconds: 0, average_rating: 0, review_count: 0,
    published_at: new Date(Date.now() - index * 1000).toISOString(),
  }));
  await page.route("https://audit.supabase.co/rest/v1/social_feed**", async (route) => {
    const hasCursor = new URL(route.request().url()).searchParams.has("or");
    cursors.push(hasCursor);
    // Keep the first page in flight while the user scrolls the already-rendered cache.
    if (slowRefresh && !hasCursor) await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hasCursor ? rows.slice(8) : rows.slice(0, 8)) });
  });
  await page.goto("/");
  await expect(page.locator(".social-video-card")).toHaveCount(8);
  slowRefresh = true;
  cursors.length = 0;
  await page.reload();
  await expect(page.locator(".social-video-card")).toHaveCount(8);
  await page.locator(".social-feed").evaluate((node) => node.scrollTo({ top: node.scrollHeight, behavior: "auto" }));
  await expect(page.locator(".social-video-card")).toHaveCount(9, { timeout: 10_000 });
  expect(cursors).toEqual([false, true]);
});

test("nearby uses commercial coordinates and excludes unknown locations (simulated GPS)", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 14.7, longitude: -17.4, accuracy: 30 });
  await page.route("https://audit.supabase.co/rest/v1/provider_profiles**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
    profile_id: "11111111-1111-4111-8111-111111111111", business_name: "Atelier test", city: "Dakar", service_mode: "salon", average_rating: 0, review_count: 0,
    provider_services: [0, 1, 2].map((index) => ({ id: `22222222-2222-4222-8222-22222222222${index}`, title: "Tresses", duration_minutes: 60, price_amount: 15000,
      businesses: index === 2 ? null : { address: "Adresse commerciale", city: index === 0 ? "Dakar" : "Thiès", area: null, latitude: index === 0 ? 14.71 : 14.79, longitude: index === 0 ? -17.4 : -16.92 },
    })),
  }]) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Près de moi", exact: true }).click();
  await expect(page.getByText("Résultats dans un rayon de 25 km", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Voir les résultats", exact: true }).click();
  await expect(page.locator(".social-video-card")).toHaveCount(1);
  await expect(page.locator(".social-video-card")).toContainText("Inspiration 1");
});

test("nearby permission refusal offers a manual zone and keeps it in Explorer (simulated position)", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Près de moi", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Localisation refusée" })).toBeVisible();
  await expect(page.getByLabel("Ville ou quartier")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Voir les résultats", exact: true })).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Filtres du feed" })).toBeInViewport();
  await page.getByLabel("Ville ou quartier").fill("Dakar");
  await page.getByRole("button", { name: "Voir les résultats", exact: true }).click();
  await expect(page.locator(".social-video-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Dakar · Modifier" }).click();
  await page.getByLabel("Ville ou quartier").fill("Thiès");
  await page.getByRole("button", { name: "Voir les résultats", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aucun créateur proche pour le moment" })).toBeVisible();
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByLabel("Ville ou quartier")).toHaveValue("Thiès");
  await page.getByRole("button", { name: "Effacer la localisation" }).click();
  await expect(page.getByLabel("Ville ou quartier")).toHaveValue("");
});

test("desktop wheel reaches the feed from both the content and side margins", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1000, "Desktop margin behaviour");
  await page.goto("/");
  const feed = page.locator(".social-feed");
  await expect(page.locator(".social-video-card")).toHaveCount(3);
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, viewport.height);
  await expect.poll(() => feed.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await page.mouse.wheel(0, -viewport.height);
  await expect.poll(() => feed.evaluate((node) => node.scrollTop)).toBe(0);
  await page.mouse.move(30, viewport.height / 2);
  await page.mouse.wheel(0, viewport.height);
  await expect.poll(() => feed.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.mouse.move(30, 350);
  await page.mouse.wheel(0, -700);
  await expect.poll(() => feed.evaluate((node) => node.scrollTop)).toBe(0);
});

test("authentication content and Google button fit inside the centered dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  for (const control of [page.getByRole("button", { name: "Continuer avec Google" }), page.getByLabel("Adresse e-mail"), page.getByLabel("Mot de passe"), page.getByRole("button", { name: "Se connecter", exact: true })]) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(box.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width);
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
  }
  await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
  await page.getByRole("button", { name: "Créer le compte", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Créer le compte", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Explorer survives refresh and browser back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("heading", { name: "Explorer", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Explorer", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("navigation", { name: "Filtres du feed" })).toBeVisible();
});
