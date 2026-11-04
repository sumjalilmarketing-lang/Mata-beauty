import { expect, test } from "@playwright/test";

test("homepage renders indexable public content and a canonical URL", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: /coiffure, esthétique et beauté au Sénégal/i })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://mata-beauty.com");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /https:\/\/mata-beauty\.com\/og\.png/);
});

test("robots and sitemap are served as crawl directives and valid XML", async ({ request }) => {
  const [robotsResponse, sitemapResponse] = await Promise.all([
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
  ]);
  expect(robotsResponse.status()).toBe(200);
  const robots = await robotsResponse.text();
  expect(robots).toContain("Sitemap: https://mata-beauty.com/sitemap.xml");
  expect(robots).toContain("Disallow: /app");
  expect(robots).not.toContain("Disallow: /professional");

  expect(sitemapResponse.status()).toBe(200);
  expect(sitemapResponse.headers()["content-type"]).toContain("xml");
  const sitemap = await sitemapResponse.text();
  expect(sitemap).toContain("<urlset");
  expect(sitemap).toMatch(/<loc>https:\/\/mata-beauty\.com\/?<\/loc>/);
  expect(sitemap).not.toMatch(/https:\/\/mata-beauty\.com\/(?:app|admin|staff|pro)\//);
});

test("publishes the cancellation policy with the payment activation limit", async ({ page }) => {
  const response = await page.goto("/legal/annulation");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Politique d’annulation" })).toBeVisible();
  await expect(page.getByRole("article")).toContainText("au moins 48 heures");
  await expect(page.getByRole("article")).toContainText("sans frais d’annulation");
  await expect(page.getByRole("article")).toContainText("Aucun acompte n’est actuellement encaissé");
  await expect(page.getByText("DOCUMENT EN PRÉPARATION")).toHaveCount(0);
});
