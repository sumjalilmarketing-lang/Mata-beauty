import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

type Entry = { page: string; element: string; kind: string; href: string; status: "NOT TESTED" | "PASS"; action?: string };
const entries = new Map<string, Entry>();

async function inventory(page: Page, zone: string) {
  const controls = await page.locator("button,a,input,select,textarea").evaluateAll((elements) => elements.filter((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && getComputedStyle(element).visibility !== "hidden";
  }).map((element) => ({
    element: element.getAttribute("aria-label") || element.textContent?.trim() || element.closest("label")?.textContent?.trim() || element.getAttribute("placeholder") || element.tagName,
    kind: element.tagName.toLowerCase(), href: element instanceof HTMLAnchorElement ? element.pathname : "",
  })));
  for (const control of controls) {
    const key = `${zone}|${control.kind}|${control.element}|${control.href}`;
    if (!entries.has(key)) entries.set(key, { page: zone, ...control, status: "NOT TESTED" });
  }
}

function passed(zone: string, label: string, action: string) {
  for (const entry of entries.values()) if (entry.page === zone && entry.element.includes(label)) { entry.status = "PASS"; entry.action = action; }
}

test("public navigation and interaction inventory on the deployed application", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400 && !response.url().includes("vercel.live")) errors.push(`${response.status()} ${response.url().split("?")[0]}`); });
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) await page.setExtraHTTPHeaders({ "x-vercel-protection-bypass": bypass });
  try {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navigation de l’application" })).toBeVisible();
    await expect(page.getByLabel("Chargement du feed")).toHaveCount(0, { timeout: 30_000 });
    await inventory(page, "Inspiration");
    for (const label of ["Rendez-vous", "Messages", "Profil"]) {
      await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: label }).click();
      await expect(page.getByRole("heading", { name: "Bienvenue", exact: true })).toBeVisible();
      passed("Inspiration", label, "Clic hors session → connexion demandée");
      await inventory(page, "Connexion");
      await page.getByRole("button", { name: "Fermer", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      passed("Connexion", "Fermer", "Clic → modale fermée");
    }
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
    await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Créer votre compte" })).toBeVisible();
    passed("Connexion", "Créer un compte", "Clic → inscription");
    await inventory(page, "Inscription");
    await page.getByRole("button", { name: "Déjà inscrit ? Se connecter" }).click();
    await expect(page.getByRole("heading", { name: "Bienvenue" })).toBeVisible();
    passed("Inscription", "Déjà inscrit", "Clic → connexion");
    await page.getByRole("button", { name: "Mot de passe oublié", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Mot de passe oublié" })).toBeVisible();
    passed("Connexion", "Mot de passe oublié", "Clic → formulaire de réinitialisation");
    await inventory(page, "Réinitialisation");
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Explorer" }).click();
    await expect(page.getByRole("heading", { name: "Explorer", exact: true })).toBeVisible();
    passed("Inspiration", "Explorer", "Clic → Explorer");
    await inventory(page, "Explorer");
    await page.getByPlaceholder("Que recherchez-vous ?").fill("aucun-resultat-qa-inexistant");
    await page.getByPlaceholder("Que recherchez-vous ?").press("Enter");
    await expect(page.getByRole("heading", { name: "Rechercher", exact: true })).toBeVisible();
    await inventory(page, "Recherche");
    await page.getByRole("button", { name: "Filtres", exact: true }).click();
    await expect(page.locator(".mobile-filter-panel select")).toBeVisible();
    passed("Recherche", "Filtres", "Clic → filtres visibles");
    await inventory(page, "Filtres");
    expect(errors).toEqual([]);
  } finally {
    await mkdir("work/final-audit", { recursive: true });
    await writeFile("work/final-audit/public-interactions.json", JSON.stringify({ baseURL: test.info().project.use.baseURL, type: "TEST RÉEL — application déployée, session anonyme", entries: [...entries.values()], errors }, null, 2));
  }
});

test("deployed authentication fits all requested viewports", async ({ page }) => {
  test.setTimeout(120_000);
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) await page.setExtraHTTPHeaders({ "x-vercel-protection-bypass": bypass });
  await mkdir("work/final-audit", { recursive: true });
  for (const [width, height] of [[375, 812], [390, 844], [430, 932], [768, 1024], [1366, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/?connexion=requise&returnTo=%2Fapp%2Fprofile");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    const google = page.getByRole("button", { name: "Continuer avec Google", exact: true });
    const bounds = (await google.boundingBox())!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width);
    await google.scrollIntoViewIfNeeded();
    await expect(google).toBeInViewport();
    await page.screenshot({ path: `work/final-audit/auth-${width}.png` });
    await page.getByRole("button", { name: "Créer un compte", exact: true }).click();
    const submit = page.getByRole("button", { name: "Créer le compte", exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
