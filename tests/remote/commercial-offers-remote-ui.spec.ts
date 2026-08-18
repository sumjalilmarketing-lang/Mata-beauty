import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REMOTE_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const appUrl = process.env.REMOTE_APP_URL ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const run = `${Date.now()}-${randomUUID().slice(0, 6)}`;
const password = `Mata-Commercial-${randomUUID()}!`;
const title = `Tresses Signature ${run}`;
let admin: SupabaseClient;
let providerId = "";
let clientId = "";
let providerEmail = "";
let clientEmail = "";
let serviceId = "";
let availabilityId = "";
const bookingDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

async function createAccount(role: "provider" | "client") {
  const email = `codex-commercial-${role}-${run}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Commercial ${role} ${run}`, legal_accepted: "true", professional_intent: role === "provider" ? "true" : "false" },
  });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  if (role === "provider") {
    expect((await admin.from("profiles").update({ role: "provider" }).eq("id", id)).error).toBeNull();
    expect((await admin.from("provider_profiles").update({ business_name: `Atelier Commercial ${run}`, slug: `atelier-commercial-${run}`.toLowerCase(), city: "Dakar", status: "approved", verified_at: new Date().toISOString() }).eq("profile_id", id)).error).toBeNull();
  }
  return { id, email };
}

async function allowPreview(page: Page) {
  if (!bypass) return;
  await page.route(`${new URL(appUrl).origin}/**`, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
}

async function signIn(page: Page, email: string) {
  await allowPreview(page);
  await page.goto(appUrl);
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: /Profil/ }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(url => url.pathname !== "/", { timeout: 25_000 });
}

test.describe.serial("offres et tarifs sur la Preview réelle", () => {
  test.beforeAll(async () => {
    admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const provider = await createAccount("provider");
    const client = await createAccount("client");
    providerId = provider.id; providerEmail = provider.email;
    clientId = client.id; clientEmail = client.email;
  });

  test.afterAll(async () => {
    if (providerId) {
      const objects = await admin.storage.from("provider-social-media").list(`${providerId}/services`);
      if (objects.data?.length) await admin.storage.from("provider-social-media").remove(objects.data.map(item => `${providerId}/services/${item.name}`));
    }
    if (serviceId) await admin.from("provider_services").delete().eq("id", serviceId);
    if (availabilityId) await admin.from("availability_rules").delete().eq("id", availabilityId);
    if (clientId) await admin.auth.admin.deleteUser(clientId);
    if (providerId) await admin.auth.admin.deleteUser(providerId);
  });

  test("le professionnel publie une offre complète depuis son espace", async ({ page }) => {
    await signIn(page, providerEmail);
    await page.goto(`${appUrl}/pro/create-service`);
    await expect(page.getByText("Offres & tarifs", { exact: true }).first()).toBeVisible();
    await page.getByLabel("Catégorie / sous-catégorie").selectOption({ index: 1 });
    await page.getByLabel("Nom public").fill(title);
    await page.getByLabel("Description").fill("Une prestation premium créée et testée de bout en bout sur la Preview Mata Beauty.");
    await page.getByLabel("Photo de couverture").setInputFiles({ name: "commercial.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await page.getByLabel("Prix de base (FCFA)").fill("20000");
    await page.getByLabel("Durée (minutes)").fill("60");
    await page.getByLabel("Politique d’annulation").fill("Annulation gratuite jusque vingt-quatre heures avant le rendez-vous.");
    await page.getByLabel("Instructions client").fill("Présentez-vous dix minutes avant le rendez-vous.");
    await page.getByLabel("Enregistrement").selectOption("published");
    await page.getByRole("button", { name: "Créer la prestation" }).click();
    await expect(page.getByRole("status")).toContainText("Prestation publiée", { timeout: 25_000 });
    const service = await admin.from("provider_services").select("id,status,price_amount").eq("provider_id", providerId).eq("title", title).single();
    expect(service.error).toBeNull(); expect(service.data?.status).toBe("published"); expect(service.data?.price_amount).toBe(20_000);
    serviceId = service.data!.id;

    await page.goto(`${appUrl}/pro/options`);
    await page.getByLabel("Prestation").selectOption(serviceId);
    await page.getByLabel("Nom").fill("Soin hydratant");
    await page.getByLabel("Prix supplémentaire").fill("3000");
    await page.getByLabel("Durée supplémentaire").fill("15");
    await page.getByText("Option obligatoire").click();
    await page.getByRole("button", { name: "Ajouter l’option" }).click();
    await expect(page.getByRole("status")).toContainText("Option ajoutée", { timeout: 15_000 });

    const starts = new Date(Date.now() - 3_600_000).toISOString().slice(0, 16);
    const ends = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);
    await page.goto(`${appUrl}/pro/promotions`);
    await page.getByLabel("Titre").fill("Lancement -10%");
    await page.getByLabel("Prestation").selectOption(serviceId);
    await page.getByLabel("Réduction").fill("10");
    await page.getByLabel("Début").fill(starts);
    await page.getByLabel("Fin").fill(ends);
    await page.getByLabel("Statut").selectOption("published");
    await page.getByRole("button", { name: "Créer la promotion" }).click();
    await expect(page.getByRole("status")).toContainText("Promotion publiée", { timeout: 15_000 });

    const availability = await admin.from("availability_rules").insert({ provider_id: providerId, weekday: new Date(`${bookingDate}T12:00:00Z`).getUTCDay(), starts_at: "09:00", ends_at: "18:00", slot_interval_minutes: 30, valid_from: bookingDate, valid_until: bookingDate }).select("id").single();
    expect(availability.error).toBeNull(); availabilityId = availability.data!.id;
  });

  test("la cliente voit le prix promotionnel, l’option et réserve un créneau réel", async ({ page }) => {
    await allowPreview(page);
    await page.goto(`${appUrl}/service/${serviceId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Lancement -10%", { exact: true })).toBeVisible();
    await expect(page.getByText("Soin hydratant", { exact: true })).toBeVisible();

    await signIn(page, clientEmail);
    await page.goto(`${appUrl}/?service=${serviceId}`);
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Soin hydratant · inclus obligatoire")).toBeVisible();
    await page.getByLabel("Choisir une autre date").fill(bookingDate);
    await expect(page.locator(".premium-slot-grid button").first()).toBeVisible({ timeout: 20_000 });
    await page.locator(".premium-slot-grid button").first().click();
    await page.getByRole("button", { name: /Confirmer ·/ }).click();
    await expect(page.getByRole("heading", { name: "Votre rendez-vous est créé" })).toBeVisible({ timeout: 25_000 });
    const booking = await admin.from("bookings").select("id,total_amount,selected_option_ids,promotion_id").eq("client_id", clientId).eq("provider_service_id", serviceId).single();
    expect(booking.error).toBeNull(); expect(booking.data?.total_amount).toBe(20_700); expect(booking.data?.selected_option_ids).toHaveLength(1); expect(booking.data?.promotion_id).toBeTruthy();
  });

  test("l’interface commerciale reste utilisable sur mobile", async ({ page }) => {
    await signIn(page, providerEmail);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${appUrl}/pro/services`);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px sans débordement`).toBe(true);
    }
  });
});
