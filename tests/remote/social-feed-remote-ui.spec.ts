import { randomUUID } from "node:crypto";
import { expect, test, webkit, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REMOTE_SUPABASE_URL ?? "";
const anonKey = process.env.REMOTE_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const remoteAppUrl = process.env.REMOTE_APP_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const run = `${Date.now()}-${randomUUID().slice(0, 6)}`;
const password = `Mata-Feed-${randomUUID()}!`;
const clientEmail = `codex-feed-client-${run}@example.test`;
const providerEmail = `codex-feed-provider-${run}@example.test`;
const moderatorEmail = `codex-feed-admin-${run}@example.test`;
const superEmail = `codex-feed-super-${run}@example.test`;
const studioCaption = `Publication Studio réelle ${run}`;
const liveSecondTitle = `Deuxième vidéo active ${run}`;
const liveSecondCaption = `Nouvelle publication sans rebuild ${run}`;
const photoTitle = `Photo Studio réelle ${run}`;
const beforeAfterTitle = `Avant Après réel ${run}`;
const messageRun = run.replace(/[0-9]/g, (digit) => String.fromCharCode(97 + Number(digit)));
const bookingMessage = `Bonjour, réservation simple ${messageRun}`;
let admin: SupabaseClient;
let clientId = "";
let providerId = "";
let moderatorId = "";
let superId = "";
let otherProviderId = "";
let providerServiceId = "";
let availabilityId = "";
let bookingId = "";
let providerApi: SupabaseClient;
let clientApi: SupabaseClient;
let moderatorApi: SupabaseClient;
let superApi: SupabaseClient;
let studioPostId = "";
let photoPostId = "";
let beforeAfterPostId = "";
let qaVideoBuffer: Buffer;
const extraVideoTitles: string[] = [];
const extraVideoCategories = ["makeup", "makeup", "barbier", "barbier", "tresses", "ongles", "ongles", "coiffure"] as const;
const browserConsoleErrors: string[] = [];
const browserNetworkErrors: string[] = [];

test.describe.configure({ mode: "serial" });

async function createUser(email: string, professional = false) {
  let lastError = "Erreur Auth inconnue";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: professional ? "Mata Feed Pro" : "Mata Feed Cliente", legal_accepted: "true", professional_intent: professional ? "true" : "false" } });
    if (!error && data.user) {
      // Synthetic QA inboxes must never receive production welcome mail.
      expect((await admin.from("welcome_email_deliveries").update({ status: "needs_review" }).eq("user_id", data.user.id)).error).toBeNull();
      return data.user.id;
    }
    lastError = error?.message ?? lastError;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
  }
  throw new Error(`Création du compte QA impossible après trois tentatives : ${lastError}`);
}

async function preparePage(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("mata-launch-welcome", "done"));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("https://vercel.live/_next-live/feedback/feedback.js")) {
      browserConsoleErrors.push(`${page.url().split("?")[0]}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    const diagnostic = `${test.info().title} | ${page.url().split("?")[0]} | ${error.stack ?? error.message}`;
    console.log("Application page error", diagnostic);
    browserConsoleErrors.push(diagnostic);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("vercel.live")) {
      browserNetworkErrors.push(`${test.info().title} | ${response.status()} ${response.request().method()} ${response.url().split("?")[0]}`);
    }
  });
  if (remoteAppUrl && bypass) {
    await page.route(`${new URL(remoteAppUrl).origin}/**`, (route) => route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass": bypass,
        "x-vercel-set-bypass-cookie": "true",
      },
    }));
  }
}

async function publishStudioVideo(page: Page, title: string, caption: string, hashtags: string) {
  if (await page.locator('input[name="video"]').count() === 0) {
    await page.getByRole("button", { name: "Créer une publication" }).click();
  }
  await page.locator('input[name="video"]').setInputFiles({
    name: "mata-beauty-qa-reel-5s.mp4",
    mimeType: "video/mp4",
    buffer: qaVideoBuffer,
  });
  await page.locator('input[name="thumbnail"]').setInputFiles({ name: "miniature-studio.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="caption"]').fill(caption);
  await page.locator('input[name="hashtags"]').fill(hashtags);
  await page.locator('input[name="location"]').fill("Dakar");
  await page.locator('select[name="serviceId"]').selectOption(providerServiceId);
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Publier la vidéo" }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 60_000 });
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  clientId = await createUser(clientEmail);
  providerId = await createUser(providerEmail, true);
  moderatorId = await createUser(moderatorEmail);
  superId = await createUser(superEmail);
  const adminRoles = await admin.from("admin_roles").select("id,key").in("key", ["admin", "super_admin"]);
  expect(adminRoles.error).toBeNull();
  const adminRoleId = adminRoles.data!.find((role) => role.key === "admin")!.id;
  const superRoleId = adminRoles.data!.find((role) => role.key === "super_admin")!.id;
  expect((await admin.from("profiles").update({ role: "admin" }).in("id", [moderatorId, superId])).error).toBeNull();
  expect((await admin.from("admin_user_roles").insert([
    { user_id: moderatorId, role_id: adminRoleId, assigned_by: superId, is_active: true },
    { user_id: superId, role_id: superRoleId, assigned_by: moderatorId, is_active: true },
  ])).error).toBeNull();
  providerApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await providerApi.auth.signInWithPassword({ email: providerEmail, password })).error).toBeNull();
  expect((await providerApi.rpc("synchronize_account_status")).error).toBeNull();
  expect((await providerApi.rpc("request_professional_profile")).error).toBeNull();
  expect((await providerApi.rpc("save_professional_onboarding", { target_business_name: "Mata Feed Pro", target_bio: "Professionnel de recette pour les tests réels de publication vidéo.", target_city: "Dakar", target_service_mode: "salon", target_activity_type: "independent", target_years_experience: 3, target_base_address: "Adresse fictive QA Dakar", target_languages: ["Français"], target_cancellation_policy: "Annulation possible avant le rendez-vous." })).error).toBeNull();
  for (const kind of ["identity", "business_registration", "qualification", "address_proof"]) {
    const path = `${providerId}/${randomUUID()}.png`;
    expect((await providerApi.storage.from("provider-documents").upload(path, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"), { contentType: "image/png" })).error).toBeNull();
    expect((await providerApi.from("provider_documents").insert({ provider_id: providerId, kind, storage_path: path })).error).toBeNull();
  }
  expect((await providerApi.rpc("submit_provider_for_review")).error).toBeNull();
  clientApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await clientApi.auth.signInWithPassword({ email: clientEmail, password })).error).toBeNull();
  moderatorApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await moderatorApi.auth.signInWithPassword({ email: moderatorEmail, password })).error).toBeNull();
  superApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await superApi.auth.signInWithPassword({ email: superEmail, password })).error).toBeNull();
  const approval = await superApi.rpc("admin_set_provider_status", { target_provider_id: providerId, next_status: "approved", reason: "Validation réelle du compte professionnel QA vidéo" });
  expect(approval.error).toBeNull();
  expect(approval.data).toBe(true);
  expect((await admin.from("provider_profiles").select("status").eq("profile_id", providerId).single()).data?.status).toBe("approved");
  const base = await admin.from("services").select("id").eq("is_active", true).limit(1).single();
  expect(base.error).toBeNull();
  const service = await admin.from("provider_services").insert({ provider_id: providerId, service_id: base.data!.id, title: `Tresses Preview ${run}`, duration_minutes: 60, price_amount: 18000, currency: "XOF", is_active: true }).select("id").single();
  expect(service.error).toBeNull();
  providerServiceId = service.data!.id;
  const tomorrow = new Date(Date.now() + 86_400_000);
  const availability = await providerApi.from("availability_rules").insert({ provider_id: providerId, weekday: tomorrow.getUTCDay(), starts_at: "09:00", ends_at: "18:00", slot_interval_minutes: 30 }).select("id").single();
  expect(availability.error).toBeNull(); availabilityId = availability.data!.id;
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  const userIds = [providerId, clientId, moderatorId, superId, otherProviderId].filter(Boolean);
  if (userIds.length) {
    const memberships = await admin.from("conversation_members").select("conversation_id").in("profile_id", userIds);
    expect.soft(memberships.error).toBeNull();
    const conversationIds = [...new Set((memberships.data ?? []).map((item) => item.conversation_id))];
    if (conversationIds.length) expect.soft((await admin.from("conversations").delete().in("id", conversationIds)).error).toBeNull();
    expect.soft((await admin.from("reports").delete().in("reporter_id", userIds)).error).toBeNull();
    expect.soft((await admin.from("moderation_actions").delete().in("actor_id", userIds)).error).toBeNull();
  }
  if (clientId && providerId) expect.soft((await admin.from("bookings").delete().eq("client_id", clientId).eq("provider_id", providerId)).error).toBeNull();
  if (providerId) expect.soft((await admin.from("posts").delete().eq("author_id", providerId)).error).toBeNull();
  if (providerId) {
    const documents = await admin.storage.from("provider-documents").list(providerId);
    expect.soft(documents.error).toBeNull();
    if (documents.data?.length) expect.soft((await admin.storage.from("provider-documents").remove(documents.data.map(file => `${providerId}/${file.name}`))).error).toBeNull();
    const bucket = admin.storage.from("provider-social-media");
    const { data: folders, error: foldersError } = await bucket.list(providerId, { limit: 100 });
    expect.soft(foldersError).toBeNull();
    const directPaths: string[] = [];
    for (const folder of folders ?? []) {
      if (folder.id) directPaths.push(`${providerId}/${folder.name}`);
      else {
        const { data: files, error: filesError } = await bucket.list(`${providerId}/${folder.name}`, { limit: 100 });
        expect.soft(filesError).toBeNull();
        const paths = (files ?? []).map((file) => `${providerId}/${folder.name}/${file.name}`);
        directPaths.push(...paths);
      }
    }
    if (directPaths.length) expect.soft((await bucket.remove(directPaths)).error).toBeNull();
    const remaining = await bucket.list(providerId, { limit: 100 });
    expect.soft(remaining.error).toBeNull();
    expect.soft(remaining.data).toEqual([]);
  }
  if (availabilityId) expect.soft((await admin.from("availability_rules").delete().eq("provider_id", providerId)).error).toBeNull();
  if (providerServiceId) expect.soft((await admin.from("provider_services").delete().eq("provider_id", providerId)).error).toBeNull();
  for (const userId of userIds) expect.soft((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  if (userIds.length) {
    const profiles = await admin.from("profiles").select("id").in("id", userIds);
    expect.soft(profiles.error).toBeNull();
    expect.soft(profiles.data).toEqual([]);
  }
  expect.soft(browserConsoleErrors, `Erreurs console: ${browserConsoleErrors.join(" | ")}`).toEqual([]);
  expect.soft(browserNetworkErrors, `Erreurs réseau: ${browserNetworkErrors.join(" | ")}`).toEqual([]);
});

test("le prestataire publie une vidéo MP4 réelle depuis Studio", async ({ page, request }) => {
  test.setTimeout(300_000);
  await preparePage(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Publier une vidéo" }).click();
  await page.getByLabel("Adresse e-mail").fill(providerEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/pro/);
  await expect(page.getByRole("navigation", { name: "Navigation Espace professionnel" }).getByRole("link")).toHaveText(["⌂Dashboard", "▶Studio", "≡Prestations", "□Agenda", "✉Messages", "¤Revenus", "○Profil"]);
  await page.goto("/pro/services");
  await expect(page.locator('.service-form select[name="serviceId"]')).toBeVisible();
  await page.locator('.service-form select[name="serviceId"]').selectOption({ index: 1 });
  await page.getByLabel("Nom affiché").fill(`Prestation simple ${run}`);
  await page.getByLabel("Durée (minutes)").fill("60");
  await page.getByLabel("Prix (FCFA)").fill("12000");
  await page.getByRole("button", { name: "Ajouter la prestation" }).click();
  await expect(page.getByText("Prestation ajoutée.")).toBeVisible();
  await expect(page.locator(".control-list-row").filter({ hasText: `Prestation simple ${run}` })).toBeVisible();
  await page.goto("/pro/agenda");
  await page.locator('select[name="day"]').selectOption(String((new Date(Date.now() + 86400000).getUTCDay() + 1) % 7));
  await page.getByRole("button", { name: "Ajouter un horaire" }).click();
  await expect(page.getByText("Disponibilités enregistrées.")).toBeVisible();
  await page.goto("/pro/revenue");
  await expect(page.getByText("Vos revenus apparaîtront ici après vos premières prestations.")).toBeVisible();
  await page.goto("/pro/videos");
  const fixture = await request.get("https://samplelib.com/mp4/sample-5s-360p.mp4");
  expect(fixture.ok()).toBeTruthy();
  expect(fixture.headers()["content-type"]).toContain("video/mp4");
  qaVideoBuffer = await fixture.body();
  for (const [index, category] of extraVideoCategories.entries()) {
    const title = `E2E ${category} ${index} ${run}`;
    extraVideoTitles.push(title);
    await publishStudioVideo(page, title, title, `#preview #${category}`);
  }
  await publishStudioVideo(page, `Studio réel ${run}`, studioCaption, "#tresses #dakar #studioe2e");
  const created = await admin.from("posts").select("id,status,visibility,published_at,post_services(provider_service_id,is_primary),social_post_media(bucket_id,storage_path,thumbnail_path)").eq("author_id", providerId).eq("title", `Studio réel ${run}`).single();
  expect(created.error).toBeNull();
  expect(created.data).toMatchObject({ status: "published", visibility: "public", post_services: [{ provider_service_id: providerServiceId, is_primary: true }] });
  expect(created.data!.published_at).not.toBeNull();
  studioPostId = created.data!.id;
  const media = created.data!.social_post_media[0];
  expect(media.bucket_id).toBe("provider-social-media");
  expect(media.storage_path).toMatch(new RegExp(`^${providerId}/${studioPostId}/video[.](webm|mp4|mov)$`));
  expect(media.thumbnail_path).toMatch(new RegExp(`^${providerId}/${studioPostId}/thumbnail[.](jpg|jpeg|png|webp)$`));
  expect((await clientApi.from("social_feed").select("id").eq("id", studioPostId).single()).error).toBeNull();
  expect((await clientApi.storage.from("provider-social-media").createSignedUrl(media.storage_path, 60)).error).toBeNull();
  expect((await clientApi.storage.from("provider-social-media").createSignedUrl(media.thumbnail_path!, 60)).error).toBeNull();

  const allVideos = await admin.from("posts").select("id,title,social_post_media(storage_path)").eq("author_id", providerId).eq("post_type", "video").eq("status", "published");
  expect(allVideos.error).toBeNull();
  expect(allVideos.data).toHaveLength(9);
  expect(allVideos.data!.every((post) => post.social_post_media.length === 1 && post.social_post_media[0].storage_path.startsWith(`${providerId}/`))).toBeTruthy();
  await page.goto("/");
  await expect(page.getByText(studioCaption)).toBeVisible({ timeout: 20_000 });
});

test("le Studio publie une photo et un avant-après réels dans Storage", async ({ page }) => {
  test.setTimeout(90_000);
  await preparePage(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Publier une vidéo" }).click();
  await page.getByLabel("Adresse e-mail").fill(providerEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/pro/);
  await page.goto("/pro/videos");
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

  await page.locator('select[name="contentType"]').selectOption("photo");
  await page.locator('input[name="media"]').setInputFiles([
    { name: "photo-reelle-1.png", mimeType: "image/png", buffer: image },
    { name: "photo-reelle-2.png", mimeType: "image/png", buffer: image },
  ]);
  await page.locator('input[name="title"]').fill(photoTitle);
  await page.locator('textarea[name="caption"]').fill(`Photo persistante ${run}`);
  await page.locator('input[name="hashtags"]').fill("#coiffure #photo");
  await page.locator('input[name="location"]').fill("Dakar");
  await page.locator('select[name="serviceId"]').selectOption(providerServiceId);
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Publier le contenu" }).click();
  await expect(page.getByText(photoTitle)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Créer une publication" }).click();
  await page.locator('select[name="contentType"]').selectOption("before_after");
  await page.locator('input[name="media"]').setInputFiles([
    { name: "avant.png", mimeType: "image/png", buffer: image },
    { name: "apres.png", mimeType: "image/png", buffer: image },
  ]);
  await page.locator('input[name="title"]').fill(beforeAfterTitle);
  await page.locator('textarea[name="caption"]').fill(`Transformation avant après ${run}`);
  await page.locator('input[name="hashtags"]').fill("#tresses #avantapres");
  await page.locator('input[name="location"]').fill("Dakar");
  await page.locator('select[name="serviceId"]').selectOption(providerServiceId);
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Publier le contenu" }).click();
  await expect(page.getByText(beforeAfterTitle)).toBeVisible({ timeout: 20_000 });

  const posts = await admin.from("posts").select("id,title,post_type,status").eq("author_id", providerId).in("title", [photoTitle, beforeAfterTitle]);
  expect(posts.error).toBeNull();
  expect(posts.data).toHaveLength(2);
  photoPostId = posts.data!.find((post) => post.post_type === "photo")!.id;
  beforeAfterPostId = posts.data!.find((post) => post.post_type === "before_after")!.id;
  const media = await admin.from("social_post_media").select("post_id,media_type,storage_path").in("post_id", [photoPostId, beforeAfterPostId]).order("sort_order");
  expect(media.error).toBeNull();
  expect(media.data).toHaveLength(4);
  expect(media.data!.map((item) => item.media_type).sort()).toEqual(["after", "before", "image", "image"]);
  expect(media.data!.every((item) => item.storage_path.startsWith(`${providerId}/`))).toBeTruthy();
});

test("RLS masque les contenus non publiables et interdit les modifications étrangères", async ({ page }) => {
  test.setTimeout(120_000);
  await preparePage(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Publier une vidéo" }).click();
  await page.getByLabel("Adresse e-mail").fill(providerEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/pro/);
  await page.goto("/pro/videos");
  const draftTitle = `Brouillon RLS ${run}`;
  await page.locator('input[name="video"]').setInputFiles({ name: "brouillon-rls.mp4", mimeType: "video/mp4", buffer: qaVideoBuffer });
  await page.locator('input[name="title"]').fill(draftTitle);
  await page.locator('textarea[name="caption"]').fill(draftTitle);
  await page.getByText("Options de publication", { exact: true }).click();
  await page.locator('select[name="status"]').selectOption("draft");
  await page.getByRole("button", { name: "Publier la vidéo" }).click();
  await expect(page.getByText(draftTitle)).toBeVisible({ timeout: 60_000 });
  const draft = await admin.from("posts").select("id,status").eq("author_id", providerId).eq("title", draftTitle).single();
  expect(draft.error).toBeNull();
  expect(draft.data?.status).toBe("draft");
  expect((await clientApi.from("social_feed").select("id").eq("id", draft.data!.id)).data).toEqual([]);

  const anonymousApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await superApi.from("launch_feed_selection").insert([
    { post_id: studioPostId, selected_by: superId },
    { post_id: draft.data!.id, selected_by: superId },
  ])).error).toBeNull();
  const selectionIds = [studioPostId, draft.data!.id];
  const publicSelection = await anonymousApi.from("launch_feed_selection").select("post_id").in("post_id", selectionIds);
  expect(publicSelection.error).toBeNull();
  expect(publicSelection.data).toEqual([{ post_id: studioPostId }]);
  expect((await clientApi.from("launch_feed_selection").insert({ post_id: photoPostId, selected_by: clientId })).error?.code).toBe("42501");
  expect((await anonymousApi.from("launch_feed_selection").insert({ post_id: photoPostId, selected_by: clientId })).error?.code).toBe("42501");
  const forbiddenSelectionUpdate = await providerApi.from("launch_feed_selection").update({ is_active: false }).eq("post_id", studioPostId).select("post_id");
  expect(forbiddenSelectionUpdate.error).toBeNull();
  expect(forbiddenSelectionUpdate.data).toEqual([]);
  expect((await superApi.from("launch_feed_selection").update({ is_active: false }).eq("post_id", studioPostId)).error).toBeNull();
  expect((await anonymousApi.from("launch_feed_selection").select("post_id").in("post_id", selectionIds)).data).toEqual([]);
  const adminSelection = await superApi.from("launch_feed_selection").select("post_id").in("post_id", selectionIds);
  expect(adminSelection.error).toBeNull();
  expect(adminSelection.data).toHaveLength(2);
  expect((await superApi.from("launch_feed_selection").delete().in("post_id", selectionIds)).error).toBeNull();

  const original = await admin.from("posts").select("caption").eq("id", studioPostId).single();
  const clientMutation = await clientApi.from("posts").update({ caption: "Modification cliente interdite" }).eq("id", studioPostId).select("id");
  expect(clientMutation.error).toBeNull();
  expect(clientMutation.data).toEqual([]);

  const otherEmail = `codex-feed-other-provider-${run}@example.test`;
  otherProviderId = await createUser(otherEmail, true);
  const otherApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await otherApi.auth.signInWithPassword({ email: otherEmail, password })).error).toBeNull();
  expect((await otherApi.rpc("synchronize_account_status")).error).toBeNull();
  expect((await otherApi.rpc("request_professional_profile")).error).toBeNull();
  const otherMutation = await otherApi.from("posts").update({ caption: "Modification prestataire étrangère interdite" }).eq("id", studioPostId).select("id");
  expect(otherMutation.error).toBeNull();
  expect(otherMutation.data).toEqual([]);
  expect((await admin.from("posts").select("caption").eq("id", studioPostId).single()).data?.caption).toBe(original.data?.caption);

  expect((await superApi.rpc("admin_set_provider_status", { target_provider_id: providerId, next_status: "suspended", reason: "Test RLS prestataire suspendu" })).error).toBeNull();
  expect((await clientApi.from("social_feed").select("id").eq("id", studioPostId)).data).toEqual([]);
  expect((await superApi.rpc("admin_set_provider_status", { target_provider_id: providerId, next_status: "approved", reason: "Restauration après test RLS" })).error).toBeNull();
  expect((await clientApi.from("social_feed").select("id").eq("id", studioPostId).single()).error).toBeNull();
  await admin.auth.admin.deleteUser(otherProviderId);
  otherProviderId = "";
});

test("un lien signé expiré est remplacé depuis le chemin Storage stable", async ({ request }) => {
  const media = await admin.from("social_post_media").select("storage_path").eq("post_id", studioPostId).single();
  expect(media.error).toBeNull();
  const expiredCandidate = await clientApi.storage.from("provider-social-media").createSignedUrl(media.data!.storage_path, 5);
  expect(expiredCandidate.error).toBeNull();
  expect((await request.get(expiredCandidate.data!.signedUrl)).status()).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 6_500));
  expect((await request.get(expiredCandidate.data!.signedUrl, { failOnStatusCode: false })).status()).toBeGreaterThanOrEqual(400);
  const renewed = await clientApi.storage.from("provider-social-media").createSignedUrl(media.data!.storage_path, 60);
  expect(renewed.error).toBeNull();
  expect(renewed.data!.signedUrl).not.toBe(expiredCandidate.data!.signedUrl);
  expect((await request.get(renewed.data!.signedUrl)).status()).toBe(200);
});

test("le feed social distant relie les interactions au profil et à la réservation", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await preparePage(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(clientEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profil", exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navigation de l’application" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(studioCaption)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(photoTitle)).toBeVisible();
  const beforeAfterCard = page.locator(".social-video-card").filter({ hasText: beforeAfterTitle });
  await expect(beforeAfterCard.getByRole("img", { name: "Avant" })).toBeVisible();
  await expect(beforeAfterCard.getByRole("img", { name: "Après" })).toBeVisible();

  const liveProviderContext = await browser.newContext();
  const liveProviderPage = await liveProviderContext.newPage();
  await preparePage(liveProviderPage);
  await liveProviderPage.goto("/");
  await liveProviderPage.getByRole("button", { name: "Publier une vidéo" }).click();
  await liveProviderPage.getByLabel("Adresse e-mail").fill(providerEmail);
  await liveProviderPage.getByLabel("Mot de passe").fill(password);
  await liveProviderPage.getByRole("button", { name: "Se connecter", exact: true }).click();
  await liveProviderPage.waitForURL(/\/pro/);
  await liveProviderPage.goto("/pro/videos");
  await publishStudioVideo(liveProviderPage, liveSecondTitle, liveSecondCaption, "#tresses #cache #tempsreel");
  await liveProviderContext.close();

  const navigation = page.getByRole("navigation", { name: "Navigation de l’application" });
  await navigation.getByRole("button", { name: "Explorer", exact: true }).click();
  await navigation.getByRole("button", { name: "Inspiration" }).click();
  await expect(page.getByText(liveSecondCaption)).toBeVisible({ timeout: 30_000 });
  expect((await admin.from("posts").select("id").eq("author_id", providerId).eq("title", liveSecondTitle).single()).error).toBeNull();

  const desktopFeed = page.locator(".social-feed");
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const bounds = await desktopFeed.boundingBox(); expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.wheel(0, -5000);
    await expect.poll(() => desktopFeed.evaluate(node => node.scrollTop)).toBeLessThan(5);
    await page.mouse.wheel(0, 1000);
    await expect.poll(() => desktopFeed.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    await page.mouse.wheel(0, -5000);
    await expect.poll(() => desktopFeed.evaluate(node => node.scrollTop)).toBeLessThan(5);
    // Traverse a full card at every viewport: 840px is insufficient at 1080p
    // and mandatory snap can correctly return that incomplete gesture to zero.
    for (let tick = 0; tick < Math.ceil(bounds!.height / 70) + 4; tick++) await page.mouse.wheel(0, 70);
    await expect.poll(() => desktopFeed.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  // Start playback assertions from a fresh feed view after the viewport/gesture
  // matrix; an in-flight wheel snap can otherwise move the target offscreen.
  await navigation.getByRole("button", { name: "Explorer", exact: true }).click();
  await navigation.getByRole("button", { name: "Inspiration" }).click();
  await expect(page.getByText(liveSecondCaption)).toBeVisible({ timeout: 30_000 });

  const mainCard = page.locator(".social-video-card").filter({ hasText: studioCaption });
  const activeVideo = mainCard.locator("video");
  await expect(activeVideo).toBeVisible();
  await mainCard.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "auto" }));
  await expect(activeVideo).toHaveAttribute("preload", "auto");
  const playbackStartedAt = Date.now();
  try {
    await expect.poll(() => activeVideo.evaluate((element) => (element as HTMLVideoElement).currentTime), { timeout: 15_000 }).toBeGreaterThan(0);
    console.log("VIDEO_START_LATENCY_MS", Date.now() - playbackStartedAt);
  } catch (error) {
    console.log("VIDEO_START_FAILURE", await activeVideo.evaluate((element) => {
      const video = element as HTMLVideoElement;
      return { currentTime: video.currentTime, readyState: video.readyState, networkState: video.networkState, paused: video.paused, error: video.error?.code ?? null, source: video.currentSrc.split("?")[0], connected: video.isConnected };
    }));
    const mediaUrl = await activeVideo.evaluate((element) => (element as HTMLVideoElement).currentSrc);
    const started = Date.now();
    try {
      const mediaResponse = await page.request.get(mediaUrl, { timeout: 15_000, headers: { Range: "bytes=0-65535" } });
      console.log("VIDEO_RANGE_DIAGNOSTIC", { status: mediaResponse.status(), bytes: (await mediaResponse.body()).length, elapsedMs: Date.now() - started });
    } catch { console.log("VIDEO_RANGE_DIAGNOSTIC", { timedOut: true, elapsedMs: Date.now() - started }); }
    console.log("VIDEO_PLAYER_DIAGNOSTIC", await page.locator("video").evaluateAll((elements) => elements.map((element) => {
      const video = element as HTMLVideoElement;
      return { time: video.currentTime, ready: video.readyState, network: video.networkState, paused: video.paused, hasSource: Boolean(video.getAttribute("src")) };
    })));
    throw error;
  }
  expect(await activeVideo.evaluate((element) => { const video = element as HTMLVideoElement; return { muted: video.muted, loop: video.loop, preload: video.preload }; })).toEqual({ muted: true, loop: true, preload: "auto" });
  await mainCard.getByRole("button", { name: "Mettre la vidéo en pause" }).click();
  await expect.poll(() => activeVideo.evaluate((element) => (element as HTMLVideoElement).paused)).toBeTruthy();
  await mainCard.getByRole("button", { name: "Lire la vidéo" }).click();
  await expect.poll(() => activeVideo.evaluate((element) => (element as HTMLVideoElement).paused)).toBeFalsy();
  await mainCard.getByRole("button", { name: "Activer le son" }).click();
  await expect.poll(() => activeVideo.evaluate((element) => (element as HTMLVideoElement).muted)).toBeFalsy();
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => undefined }));
  await mainCard.getByRole("button", { name: "Partager" }).click();
  await expect(page.getByText("Partage enregistré.")).toBeVisible();
  const nextCard = page.locator(".social-video-card").filter({ hasText: liveSecondCaption });
  await nextCard.evaluate(node => node.scrollIntoView({ block: "start", behavior: "auto" }));
  await expect.poll(() => activeVideo.evaluate((element) => (element as HTMLVideoElement).paused)).toBeTruthy();
  await expect.poll(() => page.locator(".social-video-card video").evaluateAll((elements) => (elements as HTMLVideoElement[]).filter((video) => !video.paused).length)).toBeLessThanOrEqual(1);
  await expect(activeVideo).toHaveAttribute("preload", /^(metadata|none)$/);
  await mainCard.evaluate(node => node.scrollIntoView({ block: "start", behavior: "auto" }));
  await expect(page.getByText(studioCaption)).toBeVisible();
  await mainCard.getByRole("button", { name: "J’aime" }).click();
  await mainCard.getByRole("button", { name: "Enregistrer" }).click();
  await mainCard.getByRole("button", { name: "Suivre" }).click();
  await mainCard.getByRole("button", { name: "Commentaires" }).click();
  await page.getByLabel("Ajouter un commentaire").fill(`Super résultat ${run}`);
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(page.getByText(`Super résultat ${run}`)).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  await mainCard.getByRole("button", { name: "Profil de Mata Feed Pro" }).click();
  await expect(page.getByText("Mata Feed Pro").first()).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByText(studioCaption)).toBeVisible();
  await mainCard.getByRole("button", { name: "Réserver" }).click();
  await expect(page.getByRole("heading", { name: "Réserver" })).toBeVisible();
  await expect(page.getByText(`Tresses Preview ${run}`).first()).toBeVisible();
  const bookingDate = await page.getByLabel("Choisir une autre date").inputValue();
  const firstSlot = page.locator(".premium-slot-grid button").first();
  await expect(firstSlot).toBeVisible({ timeout: 20_000 });
  const selectedSlot = (await firstSlot.textContent())?.trim() ?? "";
  await firstSlot.click();
  await page.getByRole("button", { name: /^Confirmer ·/ }).click();
  await expect(page.getByRole("heading", { name: "Votre rendez-vous est créé" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Message", exact: true }).click();
  await page.getByRole("button", { name: "Messages", exact: true }).first().click();
  await page.getByPlaceholder("Écrire un message…").fill(bookingMessage);
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText(bookingMessage)).toBeVisible();
  await page.goto("/app/bookings");
  await expect(page.locator(".live-appointment").first()).toBeVisible();
  await page.goto("/app/profile");
  await expect(page.getByRole("navigation", { name: "Navigation Espace client" }).getByRole("link")).toHaveCount(5);
  const booking = await admin.from("bookings").select("id,client_id,provider_id,source_post_id").eq("source_post_id", studioPostId).eq("client_id", clientId).single();
  expect(booking.error).toBeNull(); bookingId = booking.data!.id;
  expect(booking.data).toMatchObject({ client_id: clientId, provider_id: providerId, source_post_id: studioPostId });
  const notifications = await admin.from("notifications").select("id,kind").eq("profile_id", providerId).limit(50);
  expect(notifications.error).toBeNull();
  expect(notifications.data!.filter((item) => item.kind === "booking_created")).toHaveLength(1);
  const remainingSlots = await providerApi.rpc("get_available_slots", { target_provider_id: providerId, target_provider_service_id: providerServiceId, from_date: bookingDate, days: 1 });
  expect(remainingSlots.error).toBeNull();
  const labels = (remainingSlots.data ?? []).map((slot: { slot_start: string }) => new Date(slot.slot_start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" }));
  expect(labels).not.toContain(selectedSlot);
  const stats = await providerApi.rpc("provider_creator_statistics");
  const postStats = stats.data?.find((item: { post_id: string }) => item.post_id === studioPostId);
  expect(stats.error).toBeNull(); expect(Number(postStats?.booking_clicks)).toBeGreaterThanOrEqual(1); expect(Number(postStats?.bookings)).toBe(1);

  const providerContext = await browser.newContext();
  const providerPage = await providerContext.newPage();
  await preparePage(providerPage);
  await providerPage.goto("/");
  await providerPage.getByRole("button", { name: "Publier une vidéo" }).click();
  await providerPage.getByLabel("Adresse e-mail").fill(providerEmail);
  await providerPage.getByLabel("Mot de passe").fill(password);
  await providerPage.getByRole("button", { name: "Se connecter", exact: true }).click();
  await providerPage.waitForURL(/\/pro/);
  await providerPage.goto("/pro/bookings");
  await expect(providerPage.locator(".live-appointment").first()).toBeVisible({ timeout: 20_000 });
  await providerPage.goto("/pro/videos");
  await providerPage.getByRole("button", { name: "Statistiques" }).click();
  await expect(providerPage.getByRole("heading", { name: "Performances" })).toBeVisible();
  await expect(providerPage.getByText(/1 réservations/)).toBeVisible();
  await providerContext.close();
  const [like, save, follow, comment] = await Promise.all([
    admin.from("post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("profile_id", clientId),
    admin.from("post_saves").select("post_id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("profile_id", clientId),
    admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_provider_id", providerId).eq("follower_id", clientId),
    admin.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("author_id", clientId),
  ]);
  expect([like.count, save.count, follow.count, comment.count]).toEqual([1, 1, 1, 1]);

  const conversation = await clientApi.rpc("ensure_booking_conversation", { target_booking_id: bookingId });
  expect(conversation.error).toBeNull();
  expect((await clientApi.from("messages").insert({ conversation_id: conversation.data, sender_id: clientId, body: `Golden path cliente ${messageRun}` })).error).toBeNull();
  expect((await providerApi.from("messages").insert({ conversation_id: conversation.data, sender_id: providerId, body: `Golden path artiste ${messageRun}` })).error).toBeNull();
  for (const status of ["confirmed", "in_progress", "completed"] as const) {
    const transition = await providerApi.from("bookings").update({ status }).eq("id", bookingId).select("status").single();
    expect(transition.error).toBeNull(); expect(transition.data?.status).toBe(status);
  }
  const review = await clientApi.from("reviews").insert({ booking_id: bookingId, client_id: clientId, provider_id: providerId, rating: 5, comment: `Golden path validé ${run}` }).select("id").single();
  expect(review.error).toBeNull();
  const [rating, finalStats, providerNotices, adminBooking] = await Promise.all([
    admin.from("provider_profiles").select("average_rating,review_count").eq("profile_id", providerId).single(),
    providerApi.rpc("provider_creator_statistics"),
    admin.from("notifications").select("kind").eq("profile_id", providerId),
    admin.from("bookings").select("id,status,source_post_id,total_amount").eq("id", bookingId).single(),
  ]);
  expect(rating.error).toBeNull(); expect(Number(rating.data?.average_rating)).toBe(5); expect(rating.data?.review_count).toBe(1);
  const goldenStats = finalStats.data?.find((item: { post_id: string }) => item.post_id === studioPostId);
  expect(Number(goldenStats?.bookings)).toBe(1);
  expect(providerNotices.data?.some((item) => item.kind === "booking_created")).toBeTruthy();
  expect(adminBooking.data).toMatchObject({ id: bookingId, status: "completed", source_post_id: studioPostId, total_amount: 18000 });
});

test("le signalement est examiné, masqué, audité puis restauré avec les bons rôles", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await preparePage(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(clientEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/");
  const reportedCard = page.locator(".social-video-card").filter({ hasText: studioCaption });
  await page.waitForLoadState("networkidle");
  page.once("dialog", (dialog) => dialog.accept());
  await reportedCard.getByRole("button", { name: "Signaler" }).click();
  await expect(page.getByText("Signalement transmis à la modération.")).toBeVisible();
  const report = await admin.from("reports").select("id,status,post_id").eq("post_id", studioPostId).eq("reporter_id", clientId).single();
  expect(report.error).toBeNull(); expect(report.data?.status).toBe("open");

  const forbidden = await providerApi.rpc("admin_moderate_social_post", { target_post_id: studioPostId, decision: "hide", reason: "Tentative interdite" });
  expect(forbidden.error).not.toBeNull();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await preparePage(adminPage);
  await adminPage.goto("/admin");
  await adminPage.getByLabel("Adresse administrateur").fill(moderatorEmail);
  await adminPage.getByLabel("Mot de passe").fill(password);
  await adminPage.getByRole("button", { name: "Accéder à l’administration" }).click();
  await expect(adminPage.getByRole("heading", { name: "Vue d’ensemble", level: 1 })).toBeVisible({ timeout: 20_000 });
  await adminPage.getByRole("navigation", { name: "Navigation Super Admin" }).getByRole("button", { name: "Contenu social" }).click();
  const postRow = adminPage.getByRole("row").filter({ hasText: studioCaption });
  await expect(postRow).toBeVisible({ timeout: 20_000 });
  await postRow.getByRole("button", { name: "Masquer" }).click();
  const dialog = adminPage.getByRole("dialog", { name: "Masquer cette publication ?" });
  await dialog.getByLabel("Motif obligatoire").fill("Signalement vérifié pendant la recette finale");
  await dialog.getByRole("button", { name: "Confirmer" }).click();
  await expect(adminPage.getByText("Décision appliquée et auditée.")).toBeVisible();
  expect((await admin.from("posts").select("status").eq("id", studioPostId).single()).data?.status).toBe("hidden");
  const [action, audit] = await Promise.all([
    admin.from("moderation_actions").select("action,actor_id").eq("target_id", studioPostId).eq("action", "hide").single(),
    admin.from("audit_logs").select("action,actor_id").eq("entity_id", studioPostId).eq("action", "social.post.hide").single(),
  ]);
  expect(action.data).toMatchObject({ action: "hide", actor_id: moderatorId });
  expect(audit.data).toMatchObject({ action: "social.post.hide", actor_id: moderatorId });
  expect((await clientApi.from("social_feed").select("id").eq("id", studioPostId)).data).toHaveLength(0);
  await adminContext.close();

  const restored = await superApi.rpc("admin_moderate_social_post", { target_post_id: studioPostId, decision: "restore", reason: "Restauration contrôlée Super Admin" });
  expect(restored.error).toBeNull(); expect(restored.data).toBe("published");
  expect((await clientApi.from("social_feed").select("id").eq("id", studioPostId)).data).toHaveLength(1);
});

test("les filtres et la pagination distante conservent le feed", async ({ page }) => {
  test.setTimeout(90_000);
  const feedRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/social_feed")) feedRequests.push(request.url());
  });
  await preparePage(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(clientEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/");
  await expect(page.locator(".social-video-card")).toHaveCount(8);
  // Measure pagination separately from the anonymous/authenticated page loads.
  feedRequests.length = 0;
  const feed = page.locator(".social-feed");
  await feed.evaluate((node) => node.scrollTo({ top: node.scrollHeight, behavior: "auto" }));
  await expect.poll(() => page.locator(".social-video-card").count()).toBeGreaterThan(8);
  const paginationRequests = feedRequests.filter((url) => new URL(url).searchParams.has("or"));
  expect(paginationRequests).toHaveLength(1);
  const cardTexts = await page.locator(".social-video-card").allTextContents();
  expect(new Set(cardTexts).size).toBe(cardTexts.length);
  await expect(page.getByRole("navigation", { name: "Filtres du feed" }).getByRole("button")).toHaveText(["Pour toi", "Près de moi", "Tendances"]);
  await page.getByRole("button", { name: "Près de moi", exact: true }).click();
  await page.getByLabel("Ville ou quartier").fill("Dakar");
  await page.getByRole("button", { name: "Voir les résultats", exact: true }).click();
  await expect(page.locator(".social-video-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Tendances", exact: true }).click();
  await expect.poll(() => page.locator(".social-video-card").count()).toBeGreaterThanOrEqual(10);
});

test("le parcours réel reste utilisable sur les cinq largeurs mobiles", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width <= 360 ? 740 : width <= 390 ? 844 : 932 } });
    const page = await context.newPage();
    await preparePage(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Profil" }).click();
    await page.getByLabel("Adresse e-mail").fill(clientEmail);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.waitForURL(/\/app/);
    await page.goto("/");
    await expect(page.getByText(studioCaption)).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `work/ultra-simple/feed-${width}.png` });
    const mobileCard = page.locator(".social-video-card").filter({ hasText: studioCaption });
    await mobileCard.getByRole("button", { name: "Profil de Mata Feed Pro" }).click();
    await expect(page.getByText("Mata Feed Pro").first()).toBeVisible();
    await page.getByRole("button", { name: "Retour" }).click();
    await expect(page.getByText(studioCaption)).toBeVisible();
    await mobileCard.getByRole("button", { name: "Réserver", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Réserver" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await page.screenshot({ path: `work/ultra-simple/booking-${width}.png` });
    await context.close();
  }
});

test("le feed réel fonctionne en WebKit iPhone 390 px", async () => {
  test.setTimeout(120_000);
  const webkitBrowser = await webkit.launch();
  const context = await webkitBrowser.newContext({ baseURL: remoteAppUrl ?? "http://localhost:3100", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.addEventListener("beforeunload", () => console.log("QA beforeunload", Date.now()));
    window.addEventListener("pagehide", () => console.log("QA pagehide", Date.now()));
    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => console.log("QA unhandled rejection", Date.now(), String(event.reason)));
  });
  page.on("requestfailed", (request) => console.log("WebKit request failed", Date.now(), request.url().split("?")[0], request.failure()?.errorText));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) console.log("WebKit navigation", Date.now(), frame.url().split("?")[0]); });
  page.on("console", (message) => { if (message.type() === "error") console.log("WebKit console", Date.now(), message.text()); });
  try {
    await preparePage(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
    await page.getByLabel("Adresse e-mail").fill(clientEmail);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.waitForURL(/\/app/);
    await page.waitForLoadState("networkidle");
    await page.goto("/");
    const card = page.locator(".social-video-card").filter({ hasText: studioCaption });
    const video = card.locator("video");
    await expect(video).toBeVisible({ timeout: 30_000 });
    await card.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
    await expect(card.getByRole("button", { name: "Réserver", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigation de l’application" })).toBeVisible();
    const layout = await page.evaluate(() => ({
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      scrollSnap: getComputedStyle(document.querySelector(".social-feed")!).scrollSnapType,
    }));
    expect(layout.noHorizontalOverflow).toBeTruthy();
    expect(layout.scrollSnap).toContain("y");
    await page.waitForLoadState("networkidle");
    await page.goBack();
    await expect(page).toHaveURL(/\/app/);
    await page.waitForLoadState("networkidle");
    await page.goForward();
    await expect(page.getByText(studioCaption)).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
  } finally {
    await context.close();
    await webkitBrowser.close();
  }
});

test("la navigation professionnelle reste simple sur mobile", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const width of [360, 375, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    await preparePage(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Publier une vidéo" }).click();
    await page.getByLabel("Adresse e-mail").fill(providerEmail);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.waitForURL(/\/pro/);
    await page.goto("/pro/videos");
    await expect(page.getByRole("navigation", { name: "Navigation mobile" }).getByRole("link")).toHaveCount(7);
    await expect(page.getByRole("button", { name: "Publier la vidéo", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await page.screenshot({ path: `work/ultra-simple/studio-${width}.png` });
    await page.goto("/pro/messages");
    await page.getByRole("button", { name: "Messages", exact: true }).first().click();
    await page.getByPlaceholder("Écrire un message…").focus();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await page.screenshot({ path: `work/ultra-simple/messages-${width}.png` });
    await context.close();
  }
});
