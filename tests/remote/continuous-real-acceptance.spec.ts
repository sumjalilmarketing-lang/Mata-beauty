import { expect, test, type Browser, type Page } from "@playwright/test";

const helper = process.env.FINAL_ACCEPTANCE_HELPER_URL ?? "http://127.0.0.1:4399";
type AcceptanceReport = { ok: boolean; runId: string; checks: Array<{ name: string; passed: boolean }>; failure?: string };

async function authenticatedPage(browser: Browser, role: string, returnTo: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${helper}/login/${role}?returnTo=${encodeURIComponent(returnTo)}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.origin !== new URL(helper).origin, { timeout: 30_000 });
  return { context, page };
}

async function expectWorkspace(page: Page, label: RegExp) {
  await expect(page.getByText(label).first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Fonction non connectée")).toHaveCount(0);
}

test("parcours continu réel Supabase visible dans les espaces autorisés", async ({ browser, request }) => {
  const started = await request.get(`${helper}/start`);
  expect(started.ok()).toBeTruthy();
  const report = await started.json() as AcceptanceReport;
  expect(report.ok, report.failure).toBeTruthy();
  expect(report.checks.length).toBeGreaterThanOrEqual(20);
  expect(report.checks.every((check) => check.passed)).toBeTruthy();

  const client = await authenticatedPage(browser, "client", "/app/bookings");
  await expectWorkspace(client.page, /Espace client|Réservations/);
  await expect(client.page.locator(".workspace-list > div").first()).toBeVisible();

  const provider = await authenticatedPage(browser, "provider", "/pro/bookings");
  await expectWorkspace(provider.page, /Espace professionnel|Réservations/);
  await expect(provider.page.locator(".workspace-list > div").first()).toBeVisible();

  const salon = await authenticatedPage(browser, "salon", "/salon");
  await expectWorkspace(salon.page, /Gestion Salon|Salon Recette/);
  await expect(salon.page.getByText("Données réelles · Supabase")).toBeVisible();

  const outsider = await authenticatedPage(browser, "outsider", "/app/bookings");
  await expectWorkspace(outsider.page, /Espace client|Réservations/);
  await expect(outsider.page.locator(".workspace-list > div")).toHaveCount(0);

  await Promise.all([client.context.close(), provider.context.close(), salon.context.close(), outsider.context.close()]);
  const cleaned = await request.get(`${helper}/cleanup`);
  expect(cleaned.ok()).toBeTruthy();
});
