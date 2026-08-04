import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => { throw error; });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) throw new Error(message.text());
  });
});

test("premium home opens a real category results screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Découvrir" }).click();
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
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await expect(page.getByRole("heading", { name: "Bienvenue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeEnabled();
  await expect(page.getByRole("dialog")).not.toContainText("aperçu");
});

test("registration requires explicit legal consent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Créer votre compte" })).toBeVisible();
  const consent = page.getByRole("checkbox", { name: "Accepter les conditions générales et la politique de confidentialité" });
  await expect(consent).not.toBeChecked();
  await consent.check();
  await expect(consent).toBeChecked();
});

test("mobile bottom navigation works without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Navigation de l’application" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "Découvrir" }).click();
  await expect(page.getByPlaceholder("Que recherchez-vous ?")).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
});

test("primary mobile navigation keeps comfortable touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const buttons = page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button");
  await expect(buttons).toHaveCount(5);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box, "Le bouton principal doit être visible").not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(button).toHaveAccessibleName(/\S/);
  }
});
