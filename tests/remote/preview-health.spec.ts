import { expect, test } from "@playwright/test";

const appUrl = process.env.REMOTE_APP_URL ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

test("le Preview ne produit aucune erreur console ni route critique en erreur", async ({ page }) => {
  test.skip(!appUrl, "URL distante requise");
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const applicationResponseErrors: string[] = [];
  page.on("console", (message) => {
    const externalPreviewNoise = message.text().includes("vercel.live/_next-live/feedback/feedback.js")
      || message.text().includes("Provider's accounts list is empty")
      || message.text().includes("Not signed in with the identity provider")
      || message.text().startsWith("Failed to load resource: the server responded with a status of 403");
    if (message.type() === "error" && !externalPreviewNoise) consoleErrors.push(`${message.text()} ${message.location().url}`.trim());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(appUrl).origin) applicationResponseErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  if (bypass) {
    await page.route(`${new URL(appUrl).origin}/**`, async (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  }
  for (const path of ["/", "/discover"]) {
    const response = await page.goto(new URL(path, appUrl).toString(), { waitUntil: "networkidle" });
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("body")).toBeVisible();
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(applicationResponseErrors).toEqual([]);
});
