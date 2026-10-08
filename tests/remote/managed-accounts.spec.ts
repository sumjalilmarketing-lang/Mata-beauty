import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { completeQaMfa } from "./qa-mfa";

test("Super Admin : recherche, archivage, suspension, suppression multiple et audit", async ({ page }) => {
  test.setTimeout(240_000);
  const url = process.env.REMOTE_SUPABASE_URL;
  if (url !== "https://kazlvtxkbsdhbfvtqqdp.supabase.co") throw new Error("QA isolée obligatoire");
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const password = `QA-${randomUUID()}!`, suffix = randomUUID();
  const users: { id: string; email: string }[] = [];
  try {
    for (const kind of ["manager", "target-one", "target-two"]) {
      const email = `qa-accounts-${kind}-${suffix}@example.test`;
      const result = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { qa_suppress_email: true }, user_metadata: { display_name: kind, legal_accepted: true } });
      expect(result.error).toBeNull(); users.push({ id: result.data.user!.id, email });
    }
    const role = await service.from("admin_roles").select("id").eq("key", "super_admin").single(); expect(role.error).toBeNull();
    expect((await service.from("profiles").update({ role: "admin" }).eq("id", users[0].id)).error).toBeNull();
    expect((await service.from("admin_user_roles").insert({ user_id: users[0].id, role_id: role.data!.id, requires_mfa: true })).error).toBeNull();
    const base = process.env.REMOTE_APP_URL!, bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) await page.route(`${new URL(base).origin}/**`, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass } }));
    await page.goto("/");
    expect(await page.evaluate(async () => (await fetch("/api/admin/accounts")).status)).toBe(403);
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: /^(Profil|Se connecter à MATA Beauty)$/ }).click();
    await page.getByLabel("Adresse e-mail").fill(users[0].email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Navigation Espace client" })).toBeVisible();
    expect(await page.evaluate(async () => (await fetch("/api/admin/accounts")).status)).toBe(403);
    await page.goto("/admin"); await completeQaMfa(page); await page.getByRole("navigation", { name: "Navigation Super Admin" }).getByRole("button", { name: /Utilisateurs/ }).click();
    const search = page.getByLabel("Rechercher par nom ou e-mail");
    await search.fill(users[1].email);
    const row = page.getByRole("row").filter({ hasText: users[1].email });
    await expect(row).toBeVisible();
    for (const [width, height] of [[390, 844], [1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `work/account-lifecycle/accounts-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const action of ["Archiver", "Réactiver", "Suspendre", "Réactiver"]) {
      await row.getByRole("button", { name: action, exact: true }).click();
      const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
      await dialog.getByLabel("Justification obligatoire").fill("Recette QA du cycle des comptes");
      await dialog.getByRole("button", { name: "Confirmer l’opération", exact: true }).click();
      await expect(dialog.getByText("Opération terminée et journalisée.", { exact: false })).toBeVisible();
      expect((await service.from("profiles").select("is_suspended").eq("id", users[1].id).single()).data!.is_suspended).toBe(action !== "Réactiver");
      await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
      await expect(row.getByRole("button", { name: action === "Réactiver" ? "Suspendre" : "Réactiver", exact: true })).toBeVisible();
    }
    await search.fill(suffix); await page.getByLabel("État du compte").selectOption("test");
    for (const user of users.slice(1)) await page.getByRole("checkbox", { name: `Sélectionner ${user.email}`, exact: true }).check();
    await expect(page.getByRole("checkbox", { name: `Sélectionner ${users[0].email}`, exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Supprimer la sélection", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.evaluate(await readFile("node_modules/axe-core/axe.min.js", "utf8"));
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: { runOnly: { type: string; values: string[] } }) => Promise<{ violations: { id: string }[] }> } }).axe;
      return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map(item => item.id);
    });
    expect(violations).toEqual([]);
    await page.screenshot({ path: "work/account-lifecycle/delete-confirmation.png" });
    await dialog.getByLabel("Justification obligatoire").fill("Fin des comptes temporaires de recette");
    await expect(dialog.getByRole("button", { name: "Confirmer l’opération", exact: true })).toBeDisabled();
    await dialog.getByLabel("Pour confirmer, saisissez", { exact: false }).fill("SUPPRIMER 2 COMPTES");
    await dialog.getByRole("button", { name: "Confirmer l’opération", exact: true }).click();
    await expect(dialog.getByText("Opération terminée et journalisée.", { exact: false })).toHaveCount(2);
    for (const user of users.slice(1)) {
      expect((await service.auth.admin.getUserById(user.id)).error).not.toBeNull();
      expect((await service.from("profiles").select("id").eq("id", user.id)).data).toEqual([]);
      const audit = await service.from("audit_logs").select("id").eq("entity_id", user.id).eq("action", "account.deleted");
      expect(audit.error).toBeNull(); expect(audit.data).toHaveLength(1);
    }
  } finally {
    for (const user of users.reverse()) {
      const exists = await service.auth.admin.getUserById(user.id);
      if (exists.data.user) expect((await service.auth.admin.deleteUser(user.id)).error).toBeNull();
    }
  }
});
