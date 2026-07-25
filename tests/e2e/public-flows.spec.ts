import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => { throw error; });
});

test("the home screen behaves like a booking application", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "De quoi avez-vous envie aujourd’hui ?" })).toBeVisible();
  await expect(page.getByPlaceholder(/Tresses, perruque/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Catégories" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Professionnels disponibles" })).toBeVisible();
  await expect(page.getByText("Awa Signature", { exact: true })).toHaveCount(0);
  await page.getByPlaceholder(/Tresses, perruque/).fill("tresses");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await expect(page.locator("#results")).toBeVisible();
});

test("authentication explains missing public configuration without a fake mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ouvrir mon compte" }).click();
  await expect(page.getByRole("alert")).toContainText("connexion sécurisée");
  await expect(page.getByRole("dialog")).not.toContainText("aperçu");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Se connecter", exact: true })).toBeDisabled();
});

test("mobile navigation is fixed and layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Navigation de l’application" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByText("Rendez-vous")).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});
