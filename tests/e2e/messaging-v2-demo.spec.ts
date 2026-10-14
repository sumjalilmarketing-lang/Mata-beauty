import { expect, test } from "@playwright/test";

test("messaging V2 demo exercises role, request, story and local message interactions", async ({ page }, testInfo) => {
  const supabaseRequests: string[] = [];
  page.on("request", request => {
    if (/supabase\.co/i.test(request.url())) supabaseRequests.push(request.url());
  });

  await page.goto("/messaging-v2-demo");
  await expect(page.getByText("Démonstration visuelle — données fictives")).toBeVisible();
  await expect(page.getByText("Aucune action n’est enregistrée. Cette page ne se connecte pas à Supabase.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ajouter une Story/ })).toHaveCount(0);
  await page.getByLabel("Profil de démonstration").selectOption("owner");
  if (await page.evaluate(() => window.innerWidth <= 700)) await page.locator(".mv2-thread-row").first().click();
  await expect(page.getByLabel("Attribuer la conversation")).toBeVisible();
  await page.getByLabel("Attribuer la conversation").selectOption("fatou");
  await expect(page.locator(".mv2-toast")).toContainText("Attribution simulée");
  if (await page.evaluate(() => window.innerWidth <= 700)) await page.getByRole("button", { name: "Retour à la liste" }).click();
  await page.getByRole("tab", { name: /Demandes/ }).click();
  await page.getByRole("button", { name: "Accepter" }).click();
  await expect(page.locator(".mv2-toast")).toContainText("Demande acceptée");
  await page.getByRole("tab", { name: "Conversations" }).click();
  await page.getByLabel("Profil de démonstration").selectOption("independent");
  await expect(page.getByRole("button", { name: /Ajouter une Story/ })).toBeVisible();
  await expect(page.getByLabel("Attribuer la conversation")).toHaveCount(0);
  await page.getByLabel("Profil de démonstration").selectOption("collaborator");
  await expect(page.getByRole("button", { name: /Ajouter une Story/ })).toHaveCount(0);
  await expect(page.getByLabel("Attribuer la conversation")).toHaveCount(0);
  await page.getByLabel("Profil de démonstration").selectOption("owner");
  await page.getByRole("button", { name: /Voir la Story de Studio Naya/ }).click();
  await expect(page.getByRole("dialog", { name: "Story de Studio Naya" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  if (await page.evaluate(() => window.innerWidth <= 700)) await page.locator(".mv2-thread-row").first().click();
  await page.getByLabel("Écrire un message").fill("Réponse de démonstration");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.locator(".mv2-bubble-row.is-self .mv2-bubble").last()).toContainText("Réponse de démonstration");
  expect(supabaseRequests).toEqual([]);
  const sentMessageContrast = await page.locator(".mv2-bubble-row.is-self .mv2-bubble").last().evaluate(element => {
    const color = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number) ?? [];
    const background = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
    const luminance = (channels: number[]) => channels.slice(0, 3).reduce((sum, channel, index) => {
      const value = channel / 255;
      return sum + [0.2126, 0.7152, 0.0722][index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2);
    }, 0);
    const [lighter, darker] = [luminance(color), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  });
  expect(sentMessageContrast).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator(".mv2-toast")).toBeHidden();
  await page.screenshot({ path: `test-results/messaging-v2-demo-${testInfo.project.name}.png`, fullPage: true });
});

test("mobile messaging V2 demo fits the viewport and returns from the thread to the inbox", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/messaging-v2-demo");
  await expect(page.locator(".mv2-thread-row").first()).toBeVisible();
  const dimensions = await page.evaluate(() => ({ bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth }));
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  await page.locator(".mv2-thread-row").first().click();
  await expect(page.getByLabel("Écrire un message")).toBeVisible();
  await page.getByRole("button", { name: "Retour à la liste" }).click();
  await expect(page.getByRole("tab", { name: "Conversations" })).toBeVisible();
});

test("demo-only preview redirects app routes and blocks API routes before Supabase", async ({ page }) => {
  test.skip(process.env.MESSAGING_V2_DEMO_ONLY !== "true", "Enabled only for the branch-scoped fictitious-data Preview.");
  const supabaseRequests: string[] = [];
  page.on("request", request => {
    if (/supabase\.co/i.test(request.url())) supabaseRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/messaging-v2-demo$/);
  await expect(page.getByText("Démonstration visuelle — données fictives")).toBeVisible();
  const apiResponse = await page.request.get("/api/stories");
  expect(apiResponse.status()).toBe(404);
  expect(await apiResponse.json()).toEqual({ error: "DEMO_ONLY" });
  expect(supabaseRequests).toEqual([]);
});
