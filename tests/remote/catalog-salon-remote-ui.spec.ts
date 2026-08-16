import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REMOTE_SUPABASE_URL ?? "";
const anonKey = process.env.REMOTE_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const remoteAppUrl = process.env.REMOTE_APP_URL ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const run = `${Date.now()}-${randomUUID().slice(0, 6)}`;
const password = `Mata-Catalogue-${randomUUID()}!`;
const clientEmail = `codex-catalog-client-${run}@example.test`;
const catalogEmail = `codex-catalog-provider-${run}@example.test`;
const salonEmail = `codex-salon-owner-${run}@example.test`;
const moderatorEmail = `codex-salon-moderator-${run}@example.test`;
const expectedCategories = ["Coiffure femme", "Coiffure homme", "Tresses africaines", "Locks", "Perruques et lace wigs", "Maquillage", "Onglerie", "Cils et sourcils", "Barbier", "Soins du visage", "Beauté à domicile"];
const salonName = `Salon Golden ${run}`;
const salonServiceTitle = `Make-up Salon ${run}`;
const salonMessage = `Message salon réel ${run}`;
const salonReply = `Réponse salon réelle ${run}`;

let admin: SupabaseClient;
let clientApi: SupabaseClient;
let salonApi: SupabaseClient;
let moderatorApi: SupabaseClient;
let clientId = "";
let catalogProviderId = "";
let salonId = "";
let moderatorId = "";
let salonBusinessId = "";
let salonServiceId = "";
let collaboratorId = "";
let salonBookingId = "";
const catalogServiceIds: string[] = [];
const availabilityIds: string[] = [];

test.describe.configure({ mode: "serial" });

async function createUser(email: string, professional = false) {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: professional ? "Professionnel Catalogue" : "Cliente Catalogue", legal_accepted: "true", professional_intent: professional ? "true" : "false" } });
  expect(created.error).toBeNull();
  return created.data.user!.id;
}

async function enablePreview(page: Page) {
  if (!bypass) return;
  await page.route(`${new URL(remoteAppUrl).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
}

async function signIn(page: Page, email: string) {
  await enablePreview(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((target) => target.pathname !== "/", { timeout: 25_000 });
}

test.beforeAll(async () => {
  admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  clientId = await createUser(clientEmail);
  catalogProviderId = await createUser(catalogEmail, true);
  salonId = await createUser(salonEmail, true);
  moderatorId = await createUser(moderatorEmail);
  expect((await admin.from("profiles").update({ role: "admin", is_suspended: false }).eq("id", moderatorId)).error).toBeNull();
  const moderatorRole = await admin.from("admin_roles").select("id").eq("key", "admin").single();
  expect(moderatorRole.error).toBeNull();
  expect((await admin.from("admin_user_roles").insert({ user_id: moderatorId, role_id: moderatorRole.data!.id, assigned_by: moderatorId, is_active: true, requires_mfa: false })).error).toBeNull();
  expect((await admin.from("provider_profiles").update({ business_name: `Catalogue Golden ${run}`, slug: `catalogue-golden-${run}`.toLowerCase(), status: "approved", city: "Dakar", service_mode: "both" }).eq("profile_id", catalogProviderId)).error).toBeNull();
  expect((await admin.from("provider_profiles").update({ business_name: salonName, slug: `salon-golden-${run}`.toLowerCase(), status: "approved", city: "Dakar", service_mode: "salon" }).eq("profile_id", salonId)).error).toBeNull();

  const categories = await admin.from("categories").select("id,name,slug").in("name", expectedCategories).eq("is_active", true);
  expect(categories.error).toBeNull(); expect(categories.data).toHaveLength(expectedCategories.length);
  const categoryIds = categories.data!.map((category) => category.id);
  const services = await admin.from("services").select("id,category_id,slug").in("category_id", categoryIds).eq("is_active", true).order("slug");
  expect(services.error).toBeNull();
  for (const category of categories.data!) {
    const service = services.data!.find((item) => item.category_id === category.id);
    expect(service, `Prestation de référence absente pour ${category.name}`).toBeTruthy();
    const inserted = await admin.from("provider_services").insert({ provider_id: catalogProviderId, service_id: service!.id, title: `Golden ${category.slug}`, duration_minutes: 60, price_amount: 15000, currency: "XOF", is_active: true }).select("id").single();
    expect(inserted.error).toBeNull(); catalogServiceIds.push(inserted.data!.id);
  }
  const tomorrow = new Date(Date.now() + 86_400_000);
  const availability = await admin.from("availability_rules").insert({ provider_id: catalogProviderId, weekday: tomorrow.getUTCDay(), starts_at: "09:00", ends_at: "18:00", slot_interval_minutes: 30 }).select("id").single();
  expect(availability.error).toBeNull(); availabilityIds.push(availability.data!.id);

  clientApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await clientApi.auth.signInWithPassword({ email: clientEmail, password })).error).toBeNull();
  salonApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await salonApi.auth.signInWithPassword({ email: salonEmail, password })).error).toBeNull();
  moderatorApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await moderatorApi.auth.signInWithPassword({ email: moderatorEmail, password })).error).toBeNull();
});

test.afterAll(async () => {
  if (!admin) return;
  if (salonBookingId) await admin.from("bookings").delete().eq("id", salonBookingId);
  if (salonBusinessId) {
    const media = await admin.from("business_media").select("storage_path").eq("business_id", salonBusinessId);
    const mediaPaths = (media.data ?? []).map((item) => item.storage_path);
    if (mediaPaths.length) await admin.storage.from("business-media").remove(mediaPaths);
    await admin.from("businesses").delete().eq("id", salonBusinessId);
  }
  if (salonId) {
    const bucket = admin.storage.from("provider-social-media");
    const listed = await bucket.list(salonId, { limit: 100 });
    const paths = (listed.data ?? []).filter((item) => item.id).map((item) => `${salonId}/${item.name}`);
    if (paths.length) await bucket.remove(paths);
  }
  if (catalogServiceIds.length) await admin.from("provider_services").delete().in("id", catalogServiceIds);
  if (availabilityIds.length) await admin.from("availability_rules").delete().in("id", availabilityIds);
  for (const id of [moderatorId, salonId, catalogProviderId, clientId]) if (id) await admin.auth.admin.deleteUser(id);
});

test("chaque catégorie distante rejoint un profil, une prestation, un prix et des créneaux", async ({ page }) => {
  test.setTimeout(120_000);
  await enablePreview(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Découvrir" }).click();
  for (const category of expectedCategories) {
    const categoryButton = page.locator(".photo-category-grid button").filter({ hasText: category });
    await expect(categoryButton).toBeVisible();
    await categoryButton.click();
    await expect(page.getByRole("heading", { name: category, exact: true })).toBeVisible();
    const provider = page.locator(".premium-provider-card").filter({ hasText: `Catalogue Golden ${run}` });
    await expect(provider).toBeVisible();
    await expect(provider).toContainText("15 000");
    await page.getByRole("button", { name: "Retour" }).click();
  }
  await page.locator(".photo-category-grid button").filter({ hasText: "Perruques et lace wigs" }).click();
  await page.locator(".premium-provider-card").filter({ hasText: `Catalogue Golden ${run}` }).click();
  await expect(page.getByRole("button", { name: "Golden perruques-lace-wigs" })).toBeVisible();
  await page.getByRole("button", { name: "Golden perruques-lace-wigs" }).click();
  await expect(page.locator(".premium-slot-grid button").first()).toBeVisible({ timeout: 20_000 });
});

test("le Salon réalise son CRUD navigateur puis reçoit réservation, message, avis et statistiques", async ({ browser }) => {
  test.setTimeout(240_000);
  const salonContext: BrowserContext = await browser.newContext();
  const clientContext: BrowserContext = await browser.newContext();
  const salonPage = await salonContext.newPage();
  const clientPage = await clientContext.newPage();
  await signIn(salonPage, salonEmail);

  await salonPage.goto("/salon/profile");
  await salonPage.getByLabel("Nom").fill(salonName);
  await salonPage.getByLabel("Téléphone").fill("+221770000010");
  await salonPage.getByLabel("Description").fill("Salon premium interconnecté de recette finale.");
  await salonPage.getByLabel("Adresse").fill("Almadies, Dakar");
  await salonPage.getByLabel("Ville").fill("Dakar");
  await salonPage.getByLabel("Quartier / zone").fill("Almadies");
  await salonPage.getByRole("button", { name: "Créer le salon" }).click();
  await expect(salonPage.getByText("Informations du salon enregistrées.")).toBeVisible();
  const business = await admin.from("businesses").select("id").eq("owner_id", salonId).single();
  expect(business.error).toBeNull(); salonBusinessId = business.data!.id;
  // Le compte de recette représente ici un Salon déjà contrôlé et autorisé.
  expect((await moderatorApi.from("businesses").update({ status: "approved" }).eq("id", salonBusinessId)).error).toBeNull();
  const approvedBusiness = await moderatorApi.from("businesses").select("status").eq("id", salonBusinessId).single();
  expect(approvedBusiness.error).toBeNull();
  expect(approvedBusiness.data?.status).toBe("approved");

  await salonPage.goto("/salon/team");
  await salonPage.getByLabel("Nom").fill("Awa Collaboratrice");
  await salonPage.getByLabel("Fonction").fill("Make-up artist");
  await salonPage.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(salonPage.getByText("Collaborateur ajouté.")).toBeVisible();
  const collaborator = await admin.from("collaborators").select("id").eq("business_id", salonBusinessId).eq("display_name", "Awa Collaboratrice").single();
  collaboratorId = collaborator.data!.id;
  const publicCollaborator = await clientApi.from("collaborators").select("id,is_bookable,is_active").eq("id", collaboratorId).single();
  expect(publicCollaborator.error).toBeNull();
  expect(publicCollaborator.data).toMatchObject({ id: collaboratorId, is_bookable: true, is_active: true });

  await salonPage.goto("/salon/services");
  await salonPage.getByLabel("Prestation de référence").selectOption({ label: "Maquillage événement" });
  await salonPage.getByLabel("Nom public").fill(salonServiceTitle);
  await salonPage.getByLabel("Durée (minutes)").fill("60");
  await salonPage.getByLabel("Prix (FCFA)").fill("22000");
  await salonPage.getByLabel("Description").fill("Make-up premium réservable avec collaboratrice.");
  await salonPage.getByRole("button", { name: "Ajouter la prestation" }).click();
  await expect(salonPage.getByText("Prestation ajoutée au catalogue du salon.")).toBeVisible();
  const service = await admin.from("provider_services").select("id").eq("business_id", salonBusinessId).eq("title", salonServiceTitle).single();
  salonServiceId = service.data!.id;

  const bookingDate = new Date(Date.now() + 86_400_000);
  const weekday = bookingDate.getUTCDay();
  await salonPage.goto("/salon/agenda");
  await salonPage.locator(`input[name="closed-${weekday}"]`).uncheck();
  await salonPage.locator(`input[name="open-${weekday}"]`).fill("09:00");
  await salonPage.locator(`input[name="close-${weekday}"]`).fill("18:00");
  await salonPage.getByRole("button", { name: "Enregistrer les horaires" }).click();
  await expect(salonPage.getByText("Horaires enregistrés.")).toBeVisible();

  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await salonPage.goto("/salon/portfolio");
  await salonPage.getByLabel("Type").selectOption("gallery");
  await salonPage.getByLabel("Image").setInputFiles({ name: "salon-gallery.png", mimeType: "image/png", buffer: image });
  await salonPage.getByRole("button", { name: "Envoyer l’image" }).click();
  await expect(salonPage.getByText("Média du salon mis à jour.")).toBeVisible();

  await salonPage.goto("/salon/videos");
  await salonPage.locator('select[name="contentType"]').selectOption("photo");
  await salonPage.locator('input[name="media"]').setInputFiles({ name: "salon-studio.png", mimeType: "image/png", buffer: image });
  await salonPage.locator('input[name="title"]').fill(`Publication Salon ${run}`);
  await salonPage.locator('textarea[name="caption"]').fill(`Inspiration réelle du salon ${run}`);
  await salonPage.locator('select[name="serviceId"]').selectOption(salonServiceId);
  await salonPage.locator('input[name="consent"]').check();
  await salonPage.getByRole("button", { name: "Publier le contenu" }).click();
  await expect(
    salonPage.getByText("Publication visible dans Inspiration.").or(salonPage.getByText(`Publication Salon ${run}`)),
  ).toBeVisible({ timeout: 20_000 });
  await salonPage.getByRole("button", { name: "Mes photos" }).click();
  await expect(salonPage.getByText(`Publication Salon ${run}`)).toBeVisible({ timeout: 20_000 });

  await signIn(clientPage, clientEmail);
  await clientPage.goto("/");
  await clientPage.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Découvrir" }).click();
  await clientPage.locator(".photo-category-grid button").filter({ hasText: "Maquillage" }).click();
  await clientPage.locator(".premium-provider-card").filter({ hasText: salonName }).click();
  await clientPage.getByRole("button", { name: salonServiceTitle }).click();
  await clientPage.getByLabel("Choisir une autre date").fill(bookingDate.toISOString().slice(0, 10));
  await clientPage.locator(".premium-slot-grid button").first().click();
  await clientPage.getByLabel("Choisir une collaboratrice").selectOption(collaboratorId);
  await clientPage.getByRole("button", { name: /^Confirmer ·/ }).click();
  await expect(clientPage.getByRole("heading", { name: "Votre rendez-vous est créé" })).toBeVisible({ timeout: 20_000 });
  const booking = await admin.from("bookings").select("id,business_id,collaborator_id,total_amount,status").eq("client_id", clientId).eq("provider_service_id", salonServiceId).single();
  expect(booking.error).toBeNull(); salonBookingId = booking.data!.id;
  expect(booking.data).toMatchObject({ business_id: salonBusinessId, collaborator_id: collaboratorId, total_amount: 22000, status: "pending" });

  await clientPage.goto("/app/messages");
  const clientBooking = clientPage.locator(".live-appointment").filter({ hasText: salonServiceTitle });
  await clientBooking.getByRole("button", { name: "Messages" }).click();
  await clientPage.getByLabel("Votre message").fill(salonMessage);
  await clientPage.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(clientPage.getByText(salonMessage)).toBeVisible();

  await salonPage.goto("/salon/messages");
  const salonBooking = salonPage.locator(".live-appointment").filter({ hasText: salonServiceTitle });
  await salonBooking.getByRole("button", { name: "Messages" }).click();
  await expect(salonPage.getByText(salonMessage)).toBeVisible({ timeout: 15_000 });
  await salonPage.getByLabel("Votre message").fill(salonReply);
  await salonPage.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(clientPage.getByText(salonReply)).toBeVisible({ timeout: 30_000 });

  await salonPage.goto("/salon/bookings");
  const bookingRow = salonPage.locator(".salon-list > div").filter({ hasText: "22 000" });
  await bookingRow.getByRole("button", { name: "Confirmer" }).click();
  await bookingRow.getByRole("button", { name: "Démarrer" }).click();
  await bookingRow.getByRole("button", { name: "Terminer" }).click();
  await expect.poll(async () => (await admin.from("bookings").select("status").eq("id", salonBookingId).single()).data?.status, { timeout: 15_000 }).toBe("completed");
  expect((await clientApi.from("reviews").insert({ booking_id: salonBookingId, client_id: clientId, provider_id: salonId, rating: 5, comment: `Avis Salon ${run}` })).error).toBeNull();
  await salonPage.goto("/salon/reviews");
  await expect(salonPage.getByText(`Avis Salon ${run}`)).toBeVisible();
  await salonPage.goto("/salon/statistics");
  await expect(salonPage.locator(".workspace-metrics strong").filter({ hasText: "22 000" }).first()).toBeVisible();

  await salonContext.close();
  await clientContext.close();
});
