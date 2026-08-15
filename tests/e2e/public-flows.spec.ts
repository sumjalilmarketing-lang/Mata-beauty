import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("http://localhost:3000/api/auth/providers", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ google: true }) }));
  await page.route("https://audit.supabase.co/rest/v1/categories**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tresses", slug: "tresses", icon: "≋", sort_order: 1 }]) }));
  await page.route("https://audit.supabase.co/rest/v1/provider_profiles**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
    profile_id: "11111111-1111-4111-8111-111111111111", business_name: "Atelier Tresses", city: "Dakar", service_mode: "salon", average_rating: 4.8, review_count: 12, verified_at: "2026-01-01T00:00:00Z", cover_url: null,
    provider_services: [{ id: "22222222-2222-4222-8222-222222222222", title: "Tresses collées", duration_minutes: 90, price_amount: 10000, services: { name: "Tresses collées", categories: { name: "Tresses" } } }],
  }]) }));
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
  const tressesCategory = page.locator(".photo-category-grid button").filter({ hasText: "Tresses" });
  await expect(tressesCategory).toBeVisible();
  await expect(page.getByText("Awa Signature", { exact: true })).toHaveCount(0);
  await tressesCategory.click();
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

test("Google login starts a real OAuth request with a fixed callback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  const google = page.getByRole("button", { name: "Continuer avec Google", exact: true });
  await expect(google).toBeEnabled();
  const authorizeRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/auth/v1/authorize");
  await google.click();
  const oauthUrl = new URL((await authorizeRequest).url());
  expect(oauthUrl.searchParams.get("provider")).toBe("google");
  const redirect = new URL(oauthUrl.searchParams.get("redirect_to") ?? "https://invalid.test");
  expect(redirect.pathname).toBe("/auth/callback");
  expect(redirect.searchParams.get("intent")).toBe("client");
  expect(redirect.searchParams.get("next")).toBe("/");
});

test("a protected destination survives the authentication handoff", async ({ page }) => {
  await page.goto("/?connexion=requise&returnTo=%2Fpro%2Fstudio");
  await expect(page.getByRole("heading", { name: "Bienvenue" })).toBeVisible();
  const authorizeRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/auth/v1/authorize");
  await page.getByRole("button", { name: "Continuer avec Google", exact: true }).click();
  const oauthUrl = new URL((await authorizeRequest).url());
  const redirect = new URL(oauthUrl.searchParams.get("redirect_to") ?? "https://invalid.test");
  expect(redirect.searchParams.get("intent")).toBe("professional");
  expect(redirect.searchParams.get("next")).toBe("/pro/studio");
});

test("password recovery does not require the old password", async ({ page }) => {
  await page.goto("/?auth=reset");
  await expect(page.getByRole("heading", { name: "Mot de passe oublié" })).toBeVisible();
  await page.getByLabel("Adresse e-mail").fill("client@example.test");
  const recoveryRequest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/recover"));
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await recoveryRequest;
});

test("invalid OAuth callbacks fail closed without an open redirect", async ({ page }) => {
  await page.goto("/auth/callback?next=https%3A%2F%2Fevil.example%2Fsteal");
  await expect(page.getByText("Retour Google invalide.", { exact: true })).toBeVisible();
  expect(new URL(page.url()).origin).toBe("http://localhost:3000");
});

test("professional Google registration keeps a non-administrative intent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Publier" }).click();
  const authorizeRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/auth/v1/authorize");
  await page.getByRole("button", { name: "Continuer avec Google", exact: true }).click();
  const oauthUrl = new URL((await authorizeRequest).url());
  const redirect = new URL(oauthUrl.searchParams.get("redirect_to") ?? "https://invalid.test");
  expect(redirect.searchParams.get("intent")).toBe("professional");
  expect(redirect.searchParams.get("intent")).not.toBe("admin");
});
