import { expect, test, type Browser, type Page } from "@playwright/test";

const helper = process.env.FINAL_ACCEPTANCE_HELPER_URL ?? "http://127.0.0.1:4399";
const remoteAppUrl = process.env.REMOTE_APP_URL ?? "";
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
type AcceptanceReport = { ok: boolean; runId: string; checks: Array<{ name: string; passed: boolean }>; failure?: string };

async function authenticatedPage(browser: Browser, role: string, returnTo: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (remoteAppUrl && vercelBypass) {
    await page.route(`${new URL(remoteAppUrl).origin}/**`, async (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": vercelBypass, "x-vercel-set-bypass-cookie": "true" } }));
    await page.goto(remoteAppUrl, { waitUntil: "domcontentloaded" });
  }
  const credentialsResponse = await fetch(`${helper}/credentials/${role}`);
  if (!credentialsResponse.ok) throw new Error(`Identifiants temporaires indisponibles pour ${role}`);
  const credentials = await credentialsResponse.json() as { email: string; password: string };
  const entry = role === "provider" || role === "salon" ? "Publier" : "Profil";
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: entry }).click();
  await page.getByLabel("Adresse e-mail").fill(credentials.email);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => url.origin === new URL(remoteAppUrl).origin && url.pathname !== "/", { timeout: 25_000 });
  await page.goto(new URL(returnTo, remoteAppUrl).toString(), { waitUntil: "domcontentloaded" });
  return { context, page };
}

async function expectWorkspace(page: Page, label: RegExp) {
  await expect(page.getByRole("heading", { name: label }).first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Fonction non connectée")).toHaveCount(0);
}

test("parcours continu réel Supabase visible dans les espaces autorisés", async ({ browser, request }) => {
  test.setTimeout(120_000);
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
