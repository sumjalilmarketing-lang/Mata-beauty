import { expect, test } from "@playwright/test";

const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN ?? "https://audit.supabase.co";

test("server discovery finds an older match without downloading unrelated pages or waiting for the catalogue", async ({ page }) => {
  const image = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const base = { author_id: "11111111-1111-4111-8111-111111111111", caption: "Sans correspondance", video_url: image, thumbnail_url: null, duration_seconds: 0, view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0, business_name: "Autre créateur", slug: "autre", city: "Paris", published_at: "2026-11-09T12:00:00Z", post_type: "photo", hashtags: [], provider_service_id: null };
  const firstPage = Array.from({ length: 8 }, (_, i) => ({ ...base, id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }));
  const olderMatch = { ...base, id: "99999999-9999-4999-8999-999999999999", caption: "Tresses protectrices", business_name: "Atelier trouvé", city: "Dakar", published_at: "2026-11-08T12:00:00Z" };
  const searches: unknown[] = [];
  await page.route(`${api}/rest/v1/provider_profiles**`, route => route.fulfill({ json: [] }));
  await page.route(`${api}/rest/v1/social_feed**`, route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("select") === "id") return route.fulfill({ json: { id: olderMatch.id } });
    return route.fulfill({ json: firstPage });
  });
  await page.route(`${api}/rest/v1/rpc/search_inspiration_feed`, route => {
    const args = route.request().postDataJSON();
    searches.push(args);
    expect(args).toMatchObject({ target_query: "tresses", target_country_code: "SN", before_id: null, before_published_at: null, page_size: 8 });
    return route.fulfill({ json: [olderMatch] });
  });
  await page.goto("/?search=1&applied=1&q=tresses&country=SN");
  await expect(page.locator(".social-video-card")).toHaveCount(1);
  await expect(page.locator(".social-video-card")).toHaveAttribute("data-post-id", olderMatch.id);
  await expect(page.locator(".social-video-card")).toContainText("Atelier trouvé");
  expect(searches).toHaveLength(1);
});

test("search remains usable while the feed is still loading", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/rest/v1/social_feed**", async route => {
    await gate;
    await route.fulfill({ json: [] });
  });
  try {
    await page.goto("/");
    await expect(page.locator(".feed-skeleton")).toBeVisible();
    await page.getByRole("button", { name: "Rechercher", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Que souhaitez-vous découvrir ?" })).toBeVisible();
  } finally { release(); }
});

test("an invalid country URL cannot crash the discovery screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?search=1&applied=1&country=INVALID&q=tresses");
  await expect(page.locator(".inspiration-active-filters")).toContainText("tresses");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Pays", exact: true })).toHaveValue("");
  expect(errors).toEqual([]);
});

test("Back and Forward restore the applied feed filters", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Professionnel, salon ou prestation", { exact: true }).fill("tresses");
  await page.getByRole("button", { name: "Afficher les vidéos", exact: true }).click();
  await expect(page).toHaveURL(/q=tresses/);
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Professionnel, salon ou prestation", { exact: true }).fill("massage");
  await page.getByRole("button", { name: "Afficher les vidéos", exact: true }).click();
  await expect(page).toHaveURL(/q=massage/);

  await page.goBack();
  await expect(page).toHaveURL(/q=tresses/);
  await expect(page.locator(".inspiration-active-filters")).toContainText("tresses");
  await expect(page.locator(".inspiration-active-filters")).not.toContainText("massage");
  await page.goForward();
  await expect(page).toHaveURL(/q=massage/);
  await expect(page.locator(".inspiration-active-filters")).toContainText("massage");
});
