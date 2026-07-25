import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
});

test("catalogue search and provider booking demo are explicit", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Votre beauté/ })).toBeVisible();
  await page.getByPlaceholder(/Tresses, maquillage/).fill("Awa");
  await expect(page.getByText("Awa Signature", { exact: true })).toBeVisible();
  await page.getByRole("article").filter({ hasText: "Awa Signature" }).getByRole("button", { name: "Voir le profil" }).click();
  await expect(page.getByRole("dialog")).toContainText("Profil vérifié");
  await page.getByRole("button", { name: "Réserver maintenant" }).click();
  await expect(page.getByRole("dialog")).toContainText("Mode test");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.getByRole("status")).toContainText("Demande simulée");
});

test("authentication explains missing public configuration", async ({ page }) => {
  await page.goto("/");
  const loginTrigger = page.locator("header").getByRole("button", { name: "Se connecter" });
  if (await loginTrigger.isVisible()) await loginTrigger.click();
  else await page.getByRole("button", { name: "Espace client" }).click();
  await expect(page.getByRole("alert")).toContainText("clé publique Supabase");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Se connecter", exact: true })).toBeDisabled();
});

test("layout has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});
