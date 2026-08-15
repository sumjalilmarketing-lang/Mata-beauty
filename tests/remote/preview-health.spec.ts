import { expect, test } from "@playwright/test";

const appUrl = process.env.REMOTE_APP_URL ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

test("le Preview ne produit aucune erreur console ni route critique en erreur", async ({ page }) => {
  test.skip(!appUrl || !bypass, "Preview Vercel protégé requis");
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("vercel.live/_next-live/feedback/feedback.js")) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(`${new URL(appUrl).origin}/**`, async (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  for (const path of ["/", "/discover"]) {
    const response = await page.goto(new URL(path, appUrl).toString(), { waitUntil: "networkidle" });
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("body")).toBeVisible();
  }
  for (const path of ["/manifest.webmanifest", "/api/health/server"]) {
    const response = await fetch(new URL(path, appUrl), { headers: { "x-vercel-protection-bypass": bypass } });
    expect(response.status, path).toBe(200);
    expect(response.headers.get("content-type"), path).toContain("application/");
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
