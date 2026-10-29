import { expect, test } from "@playwright/test";

const supabase = "https://audit.supabase.co";
const superAdminContext = {
  is_super_admin: true,
  roles: ["super_admin"],
  permissions: ["users.read", "providers.read", "documents.review", "bookings.read", "categories.manage", "payments.read", "commissions.manage", "payouts.manage", "reviews.moderate", "reports.manage", "content.manage", "notifications.send", "support.manage", "roles.manage", "audit.read", "settings.read", "settings.update"],
  requires_mfa: false,
};

test("Super Admin : six familles, accordéon accessible, page active conservée et menu mobile refermable", async ({ page }) => {
  await page.route(`${supabase}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, prefer",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (path === "/auth/v1/settings") return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ external: {} }) });
    if (path === "/auth/v1/token") return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({
      access_token: "admin-navigation-test-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "admin-navigation-test-refresh",
      user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "admin-navigation@example.test", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: new Date().toISOString() },
    }) });
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.split("/").at(-1);
      const body = name === "admin_mfa_required" ? false : name === "get_admin_context" ? superAdminContext : null;
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    }
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "[]" });
  });

  await page.goto("/admin");
  await page.getByLabel("Adresse administrateur").fill("admin-navigation@example.test");
  await page.getByRole("textbox", { name: /Mot de passe/ }).fill("Navigation-Test-Only-Password");
  await page.getByRole("button", { name: "Accéder à l’administration" }).click();

  const navigation = page.getByRole("navigation", { name: "Navigation Super Admin" });
  await expect(navigation).toBeVisible();
  const isMobile = (await page.evaluate(() => window.innerWidth)) <= 920;
  if (isMobile) await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();
  const groups = ["Pilotage", "Utilisateurs & accès", "Activité & prestations", "Finances", "Communication & qualité", "Configuration & sécurité"];
  const expectedLinks: Record<string, string[]> = {
    "Pilotage": ["Vue d’ensemble", "Lancement", "Cohorte lancement", "Statistiques"],
    "Utilisateurs & accès": ["Utilisateurs", "Prestataires", "Salons", "Validations professionnelles", "Équipe & accès", "Rôles et permissions"],
    "Activité & prestations": ["Catégories", "Prestations", "Réservations", "Calendrier"],
    "Finances": ["Paiements", "Commissions", "Reversements"],
    "Communication & qualité": ["Notifications", "Avis", "Commentaires", "Signalements", "Litiges", "Support", "Contenu social", "Promotions"],
    "Configuration & sécurité": ["Paramètres", "Sécurité", "Journaux d’audit", "Maintenance", "Santé plateforme"],
  };

  for (const [index, groupName] of groups.entries()) {
    const group = navigation.getByRole("button", { name: groupName, exact: true });
    if (index === 0) await expect(group).toHaveAttribute("aria-expanded", "true");
    else {
      await group.focus();
      await page.keyboard.press("Enter");
      await expect(group).toHaveAttribute("aria-expanded", "true");
    }
    await expect(navigation.locator('button[aria-expanded="true"]')).toHaveCount(1);
    for (const link of expectedLinks[groupName]) await expect(navigation.getByRole("button", { name: link, exact: true })).toBeVisible();
    for (const otherGroup of groups.filter((name) => name !== groupName)) {
      await expect(navigation.getByRole("button", { name: otherGroup, exact: true })).toHaveAttribute("aria-expanded", "false");
    }
  }

  await navigation.getByRole("button", { name: "Utilisateurs & accès", exact: true }).click();
  await navigation.getByRole("button", { name: "Utilisateurs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Utilisateurs", level: 1 })).toBeVisible();
  await expect(page.getByText("Mata Beauty", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Utilisateurs", level: 1 })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Utilisateurs & accès", exact: true })).toHaveAttribute("aria-expanded", "true");

  if (isMobile) {
    await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();
    const closeMenu = page.getByRole("button", { name: "Fermer le menu", exact: true });
    await expect(closeMenu).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Fermer la navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Ouvrir le menu", exact: true })).toHaveAttribute("aria-expanded", "false");
  }
});
