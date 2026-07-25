import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => { throw error; });
});

test("premium home opens a real category results screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Prenez soin de vous/ })).toBeVisible();
  await expect(page.getByPlaceholder("Que recherchez-vous ?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tresses" })).toBeVisible();
  await expect(page.getByText("Awa Signature", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Tresses" }).click();
  await expect(page.getByRole("heading", { name: "Tresses", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tresses collées" })).toBeVisible();
});

test("authentication has no fake preview mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ouvrir mon compte" }).click();
  await expect(page.getByRole("alert")).toContainText("connexion sécurisée");
  await expect(page.getByRole("dialog")).not.toContainText("aperçu");
});

test("mobile bottom navigation works without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Navigation de l’application" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: /Rechercher/ }).click();
  await expect(page.getByRole("heading", { name: "Rechercher" })).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});
