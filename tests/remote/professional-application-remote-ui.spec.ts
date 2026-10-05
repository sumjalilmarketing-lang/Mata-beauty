import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.REMOTE_SUPABASE_URL ?? "";
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
const run = randomUUID(), password = `QA-${randomUUID()}!`, accounts: { id: string; email: string }[] = [];
const business = `Dossier UI ${run}`;
async function login(page: Page, email: string) {
  const base = process.env.REMOTE_APP_URL, bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (base && bypass) await page.route(`${new URL(base).origin}/**`, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass } }));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navigation Espace client" })).toBeVisible({ timeout: 30_000 });
}
test.beforeAll(async () => {
  if (url !== "https://kazlvtxkbsdhbfvtqqdp.supabase.co") throw new Error("QA only");
  for (const label of ["candidate", "agent"]) {
    const email = `codex-application-ui-${label}-${run}@example.test`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Candidature QA", legal_accepted: true } });
    expect(result.error).toBeNull(); accounts.push({ id: result.data.user!.id, email });
  }
  const role = await admin.from("admin_roles").select("id").eq("key", "verification_agent").single();
  expect(role.error).toBeNull();
  expect((await admin.from("profiles").update({ role: "admin" }).eq("id", accounts[1].id)).error).toBeNull();
  expect((await admin.from("admin_user_roles").insert({ user_id: accounts[1].id, role_id: role.data!.id, assigned_by: accounts[1].id, is_active: true })).error).toBeNull();
});
test.afterAll(async () => {
  if (accounts[0]) {
    const docs = await admin.from("provider_documents").select("id,storage_path").eq("provider_id", accounts[0].id);
    expect(docs.error).toBeNull();
    if (docs.data?.length) {
      expect((await admin.storage.from("provider-documents").remove(docs.data.map(d => d.storage_path))).error).toBeNull();
      expect((await admin.from("document_reviews").delete().in("document_id", docs.data.map(d => d.id))).error).toBeNull();
    }
  }
  for (const account of accounts.toReversed()) expect((await admin.auth.admin.deleteUser(account.id)).error).toBeNull();
});
test("quatre documents, examen réel et approbation avant accès professionnel", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page, accounts[0].email);
  await page.goto("/pro"); await expect(page).toHaveURL(/\/app\/application/);
  await page.getByLabel("Nom de votre activité").fill(business);
  await page.getByRole("button", { name: "Commencer mon dossier" }).click();
  await page.getByLabel("Présentation", { exact: true }).fill("Présentation de recette professionnelle pour vérifier la candidature complète.");
  await page.getByLabel("Ville", { exact: true }).fill("Dakar");
  await page.getByLabel("Adresse professionnelle").fill("Adresse fictive QA Dakar");
  await page.getByLabel("Langues parlées").fill("Français");
  await page.getByLabel("Conditions d’annulation").fill("Annulation possible avant le rendez-vous.");
  await page.getByRole("button", { name: "Enregistrer les informations" }).click();
  await expect(page.getByText("Informations enregistrées. Complétez les quatre documents avant l’envoi.")).toBeVisible();
  await page.getByRole("button", { name: "Envoyer mon dossier" }).click();
  await expect(page.getByRole("heading", { name: "Votre dossier a été envoyé" })).toHaveCount(0);
  for (const kind of ["identity", "business_registration", "qualification", "address_proof"]) {
    await page.getByLabel("Type de document").selectOption(kind);
    await page.locator('input[type="file"]').setInputFiles({ name: `${kind}.png`, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await page.getByRole("button", { name: "Envoyer le document", exact: true }).click();
    await expect(page.getByRole("button", { name: "Envoyer le document", exact: true })).toBeEnabled();
  }
  await expect(page.getByText("4/4 documents reçus")).toBeVisible();
  await page.getByRole("button", { name: "Envoyer mon dossier" }).click();
  await expect(page.getByRole("heading", { name: "Votre dossier a été envoyé" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "Votre dossier a été envoyé" })).toBeVisible();
  await page.goto("/pro"); await expect(page).toHaveURL(/\/app\/application/);
  const context = await browser.newContext({ baseURL: process.env.REMOTE_APP_URL ?? "http://localhost:3100" }); const reviewer = await context.newPage();
  try {
    await login(reviewer, accounts[1].email); await reviewer.goto("/onboarding");
    await reviewer.locator(".control-list-row").filter({ hasText: business }).getByRole("button", { name: "Examiner le dossier" }).click();
    await expect(reviewer.getByRole("heading", { name: business, exact: true })).toBeVisible();
    for (const name of ["Pièce d’identité", "Immatriculation", "Qualification", "Justificatif d’adresse"]) {
      const opened = context.waitForEvent("page");
      await reviewer.getByRole("button", { name: `Voir ${name}`, exact: true }).click();
      const document = await opened; await document.waitForLoadState();
      expect(document.url()).toContain("/storage/v1/object/sign/provider-documents/");
      expect((await document.request.get(document.url())).status()).toBe(200); await document.close();
    }
    await reviewer.getByRole("combobox", { name: /Décision/ }).selectOption("approved");
    await reviewer.getByLabel("Message au candidat").fill("Dossier de recette vérifié et approuvé.");
    await reviewer.getByRole("button", { name: "Confirmer la décision" }).click();
    await expect(reviewer.getByText("Décision enregistrée et candidat notifié.")).toBeVisible();
    await page.reload(); await expect(page.getByRole("heading", { name: "Votre compte professionnel est approuvé" })).toBeVisible();
    await page.getByRole("link", { name: "Ouvrir mon espace professionnel" }).click();
    await expect(page).toHaveURL(/\/pro$/);
    expect(errors).toEqual([]);
  } catch (error) {
    await reviewer.screenshot({ path: "work/final-audit/application-review-failure.png", fullPage: true });
    throw error;
  } finally { await context.close(); }
});
