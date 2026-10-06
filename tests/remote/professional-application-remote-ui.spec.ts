import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.REMOTE_SUPABASE_URL ?? "";
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
const run = randomUUID(), password = `QA-${randomUUID()}!`, accounts: { id: string; email: string }[] = [];
const business = `Dossier UI ${run}`;
function samplePdf() {
  const stream="BT /F1 18 Tf 50 740 Td (DOCUMENT DE RECETTE - AUCUNE PIECE REELLE) Tj ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf="%PDF-1.4\n";const offsets=[0];for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
async function login(page: Page, email: string) {
  const base = process.env.REMOTE_APP_URL, bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (base && bypass) await page.route(`${new URL(base).origin}/**`, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navigation Espace client" })).toBeVisible({ timeout: 30_000 });
}
test.beforeAll(async () => {
  const productionAuthorized = process.env.ALLOW_PRODUCTION_QA === "mata-beauty.com" && url === "https://qjdwxdbvrxedyfolnpol.supabase.co" && process.env.REMOTE_APP_URL === "https://mata-beauty.com";
  if (url !== "https://kazlvtxkbsdhbfvtqqdp.supabase.co" && !productionAuthorized) throw new Error("Explicit production QA authorization required");
  for (const label of ["candidate", "agent"]) {
    const email = `codex-application-ui-${label}-${run}@example.test`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { qa_suppress_email: true }, user_metadata: { display_name: "Candidature QA", legal_accepted: true } });
    expect(result.error).toBeNull(); accounts.push({ id: result.data.user!.id, email });
  }
  const role = await admin.from("admin_roles").select("id").eq("key", "verification_agent").single();
  expect(role.error).toBeNull();
  expect((await admin.from("profiles").update({ role: "admin" }).eq("id", accounts[1].id)).error).toBeNull();
  expect((await admin.from("admin_user_roles").insert({ user_id: accounts[1].id, role_id: role.data!.id, assigned_by: accounts[1].id, is_active: true })).error).toBeNull();
});
test.afterAll(async () => {
  if (accounts[0]) {
    expect((await admin.from("notifications").delete().eq("kind", "application_to_review").contains("data", { provider_id: accounts[0].id })).error).toBeNull();
    const docs = await admin.from("provider_documents").select("id,storage_path").eq("provider_id", accounts[0].id);
    expect(docs.error).toBeNull();
    if (docs.data?.length) {
      expect((await admin.storage.from("provider-documents").remove(docs.data.map(d => d.storage_path))).error).toBeNull();
      expect((await admin.from("document_reviews").delete().in("document_id", docs.data.map(d => d.id))).error).toBeNull();
    }
  }
  // Remove the dossier before its reviewer: assigned_agent references that profile.
  for (const account of accounts) expect((await admin.auth.admin.deleteUser(account.id)).error).toBeNull();
});
test("quatre documents, examen réel et approbation avant accès professionnel", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page, accounts[0].email);
  for (const route of ["/onboarding", "/support-agent", "/moderation", "/finance", "/operations", "/staff"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/acces=refuse/);
  }
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
    await page.locator('input[type="file"]').setInputFiles(kind === "qualification" ? {name:"qualification.pdf",mimeType:"application/pdf",buffer:samplePdf()} : { name: `${kind}.png`, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
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
    reviewer.on("console", message => { if (message.type() === "error" && /violates.*Content Security Policy|Refused to frame/i.test(message.text()) && !message.text().includes("vercel.live")) errors.push("Document preview blocked by CSP"); });
    reviewer.on("dialog", dialog => dialog.accept(dialog.type() === "prompt" ? "Merci de remplacer la pièce d’identité illisible." : undefined));
    await login(reviewer, accounts[1].email); await reviewer.goto("/onboarding/notifications");
    await reviewer.locator(".notification-card").filter({ hasText: "Nouveau dossier professionnel" }).getByRole("button", { name: "Ouvrir", exact: true }).click();
    await expect(reviewer).toHaveURL(new RegExp(`dossier=${accounts[0].id}`));
    const openedNotification=await admin.from("notifications").select("read_at").eq("profile_id",accounts[1].id).eq("kind","application_to_review").contains("data",{provider_id:accounts[0].id}).single();
    expect(openedNotification.error).toBeNull();expect(openedNotification.data!.read_at).not.toBeNull();
    await expect(reviewer.getByRole("heading", { name: business, exact: true })).toBeVisible();
    await expect(reviewer.getByRole("definition").filter({ hasText: /^Candidature QA$/ })).toBeVisible();
    await expect(reviewer.getByRole("definition").filter({ hasText: /^Français$/ })).toBeVisible();
    await expect(reviewer.getByText("Annulation possible avant le rendez-vous.", { exact: true })).toBeVisible();
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [390, 844]]) {
      await reviewer.setViewportSize({ width, height });
      expect(await reviewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await reviewer.screenshot({ path: `work/final-audit/part3-dossier-${width}.png`, fullPage: true });
    }
    await reviewer.setViewportSize({ width: 1366, height: 768 });
    for (const name of ["Pièce d’identité", "Immatriculation", "Qualification", "Justificatif d’adresse"]) {
      await reviewer.getByRole("button", { name: `Voir ${name}`, exact: true }).click();
      await expect(reviewer.getByRole("dialog")).toBeVisible();
      if(name === "Qualification") {
        const pdf=reviewer.getByTitle("Document PDF privé");await expect(pdf).toBeVisible();
        const frame=await (await pdf.elementHandle())!.contentFrame();await frame!.waitForLoadState("load");
      }
      else {await expect(reviewer.getByRole("dialog").getByRole("img")).toBeVisible();await reviewer.getByRole("slider",{name:"Zoom du document"}).focus();await reviewer.getByRole("slider",{name:"Zoom du document"}).press("ArrowRight");await expect(reviewer.getByRole("slider",{name:"Zoom du document"})).toHaveValue("125");}
      const opened = context.waitForEvent("page");
      await reviewer.getByRole("link", { name: "Ouvrir le document privé dans un nouvel onglet" }).click();
      const document = await opened;
      await expect(document).toHaveURL(/\/storage\/v1\/object\/sign\/provider-documents\//);
      expect((await document.request.get(document.url())).status()).toBe(200); await document.close();
      if(name === "Qualification") {await reviewer.bringToFront();await reviewer.screenshot({path:"work/final-audit/part3-document-pdf.png"});}
      await reviewer.getByRole("button", { name: "Fermer l’aperçu" }).click();
    }
    await reviewer.locator(".document-row").filter({ hasText: "Pièce d’identité" }).getByRole("button", { name: "Demander un complément" }).click();
    await expect(reviewer.getByText("Complément demandé. Le candidat a été notifié.")).toBeVisible();
    await page.goto("/app/notifications");
    await page.locator(".notification-card").filter({ hasText: "Un complément est demandé" }).getByRole("button", { name: "Ouvrir", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/application/);
    await page.getByLabel("Type de document").selectOption("identity");
    await page.locator('input[type="file"]').setInputFiles({ name: "identity-new.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await page.getByRole("button", { name: "Envoyer le document", exact: true }).click();
    await expect(page.getByText("4/4 documents reçus")).toBeVisible();
    await page.getByRole("button", { name: "Envoyer mon dossier" }).click();
    await expect(page.getByRole("heading", { name: "Votre dossier a été envoyé" })).toBeVisible({ timeout: 20_000 });
    await reviewer.goto("/onboarding/notifications");
    await reviewer.locator(".notification-card").filter({ hasText: "Complément reçu : dossier à vérifier" }).getByRole("button", { name: "Ouvrir", exact: true }).click();
    await expect(reviewer.getByRole("heading", { name: "Historique du dossier" })).toBeVisible();
    await reviewer.getByRole("combobox", { name: /Décision/ }).selectOption("approved");
    await reviewer.getByLabel("Message au candidat").fill("Dossier de recette vérifié et approuvé.");
    await reviewer.getByRole("button", { name: "Confirmer la décision" }).click();
    await expect(reviewer.getByText("Décision enregistrée et candidat notifié.")).toBeVisible();
    await page.goto("/app/notifications");
    await page.locator(".notification-card").filter({ hasText: "Votre compte professionnel est approuvé" }).getByRole("button", { name: "Ouvrir", exact: true }).click();
    await expect(page).toHaveURL(/\/pro$/);
    const approvedNotifications=await admin.from("notifications").select("id").eq("profile_id",accounts[0].id).contains("data",{status:"approved"});
    expect(approvedNotifications.error).toBeNull();expect(approvedNotifications.data).toHaveLength(1);
    expect(errors).toEqual([]);
  } catch (error) {
    await reviewer.screenshot({ path: "work/final-audit/application-review-failure.png", fullPage: true });
    throw error;
  } finally { await context.close(); }
});
