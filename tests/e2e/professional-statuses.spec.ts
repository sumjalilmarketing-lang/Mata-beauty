import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const origin = process.env.MATA_SUPABASE_FIXTURE_ORIGIN ?? "https://audit.supabase.co";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("mata-launch-welcome", "done"));
  await page.route(`${origin}/rest/v1/categories**`, route => route.fulfill({ json: [] }));
  await page.route(`${origin}/rest/v1/provider_profiles**`, route => route.fulfill({ json: [] }));
  await page.route(`${origin}/rest/v1/social_feed**`, route => route.fulfill({ json: [] }));
  await page.route(`${origin}/rest/v1/promotions**`, route => route.fulfill({ json: [] }));
  await page.route(`${origin}/rest/v1/rpc/**`, route => route.fulfill({ json: [] }));
  await page.route(`${origin}/rest/v1/active_professional_statuses**`, route => route.fulfill({ json: [
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", provider_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      media_kind: "video", media_format: "mp4", media_path: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp4",
      caption: "Créneaux de coiffure aujourd'hui", created_at: new Date(Date.now()-60000).toISOString(),
      expires_at: new Date(Date.now()+3600000).toISOString(), business_name: "Mata Paris",
      slug: "mata-paris", city: "Paris", avatar_url: null },
    { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", provider_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      media_kind: "image", media_format: "jpg", media_path: "cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg",
      caption: "Expiré", created_at: new Date(Date.now()-90000000).toISOString(),
      expires_at: new Date(Date.now()-300000).toISOString(), business_name: "Salon expiré",
      slug: "salon-expire", city: "Dakar", avatar_url: null },
  ] }));
  await page.route(`${origin}/storage/v1/object/sign/professional-status-media/**`,
    route => route.fulfill({ json: { signedURL: "/object/sign/professional-status-media/status.mp4?token=test" } }));
});

test("a published short status is visible without a video post; expired statuses are hidden", async ({ page }) => {
  await page.goto("/");
  const bubble = page.getByRole("button", { name: "Voir les statuts de Mata Paris" });
  await expect(bubble).toBeVisible();
  await expect(page.getByRole("button", { name: "Voir les statuts de Salon expiré" })).toHaveCount(0);
  await expect(page.locator(".social-video-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajouter mon statut photo ou vidéo" })).toHaveCount(0);
  await bubble.click();
  const viewer = page.getByRole("dialog", { name: "Statut de Mata Paris" });
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText("Créneaux de coiffure");
  await expect(viewer.getByRole("button", { name: "Voir le salon et réserver" })).toBeVisible();
  await viewer.getByRole("button", { name: "Fermer le statut" }).click();
  await expect(viewer).toHaveCount(0);
});
