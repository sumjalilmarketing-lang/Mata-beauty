import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
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
const photoTitle = `Photo Studio réelle ${run}`;
const beforeAfterTitle = `Avant Après réel ${run}`;
let admin: SupabaseClient;
let clientId = "";
let providerId = "";
let moderatorId = "";
let superId = "";
let providerServiceId = "";
let availabilityId = "";
let bookingId = "";
let providerApi: SupabaseClient;
let clientApi: SupabaseClient;
let moderatorApi: SupabaseClient;
let superApi: SupabaseClient;
const extraPostIds: string[] = [];
let studioPostId = "";
let photoPostId = "";
let beforeAfterPostId = "";

test.describe.configure({ mode: "serial" });

async function createUser(email: string, professional = false) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: professional ? "Mata Feed Pro" : "Mata Feed Cliente", legal_accepted: "true", professional_intent: professional ? "true" : "false" } });
  expect(error).toBeNull(); return data.user!.id;
}

test.beforeAll(async () => {
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
  await admin.from("provider_profiles").update({ status: "approved" }).eq("profile_id", providerId);
  const base = await admin.from("services").select("id").eq("is_active", true).limit(1).single();
  const service = await admin.from("provider_services").insert({ provider_id: providerId, service_id: base.data!.id, title: `Tresses Preview ${run}`, duration_minutes: 60, price_amount: 18000, currency: "XOF", is_active: true }).select("id").single();
  providerServiceId = service.data!.id;
  providerApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await providerApi.auth.signInWithPassword({ email: providerEmail, password })).error).toBeNull();
  clientApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await clientApi.auth.signInWithPassword({ email: clientEmail, password })).error).toBeNull();
  moderatorApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await moderatorApi.auth.signInWithPassword({ email: moderatorEmail, password })).error).toBeNull();
  superApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await superApi.auth.signInWithPassword({ email: superEmail, password })).error).toBeNull();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const availability = await providerApi.from("availability_rules").insert({ provider_id: providerId, weekday: tomorrow.getUTCDay(), starts_at: "09:00", ends_at: "18:00", slot_interval_minutes: 30 }).select("id").single();
  expect(availability.error).toBeNull(); availabilityId = availability.data!.id;
  const categories = ["makeup", "makeup", "barbier", "barbier", "tresses", "tresses", "ongles", "ongles", "coiffure"];
  for (const [index, category] of categories.entries()) {
    const extra = await providerApi.rpc("create_video_post", { target_caption: `E2E ${category} ${index} ${run}`, target_video_url: `${supabaseUrl}/storage/v1/object/public/social-videos/${providerId}/${category}-${index}-${run}.mp4`, target_thumbnail_url: null, target_duration_seconds: 20, target_aspect_ratio: 0.562, target_provider_service_id: providerServiceId, target_status: "published", target_allow_comments: true, target_client_consent: true, target_scheduled_for: null, target_visibility: "public", target_hashtags: ["preview", category] });
    expect(extra.error).toBeNull(); extraPostIds.push(extra.data);
  }
  const post = await providerApi.rpc("create_video_post", { target_caption: `Transformation Preview ${run}`, target_video_url: `${supabaseUrl}/storage/v1/object/public/social-videos/${providerId}/preview-${run}.mp4`, target_thumbnail_url: null, target_duration_seconds: 20, target_aspect_ratio: 0.562, target_provider_service_id: providerServiceId, target_status: "published", target_allow_comments: true, target_client_consent: true, target_scheduled_for: null, target_visibility: "public", target_hashtags: ["preview", "tresses"] });
  expect(post.error).toBeNull();
});

test.afterAll(async () => {
  if (bookingId) await admin.from("bookings").delete().eq("id", bookingId);
  if (providerId) await admin.from("posts").delete().eq("author_id", providerId);
  if (providerId) {
    const bucket = admin.storage.from("provider-social-media");
    const { data: folders } = await bucket.list(providerId, { limit: 100 });
    const directPaths: string[] = [];
    for (const folder of folders ?? []) {
      if (folder.id) directPaths.push(`${providerId}/${folder.name}`);
      else {
        const { data: files } = await bucket.list(`${providerId}/${folder.name}`, { limit: 100 });
        const paths = (files ?? []).map((file) => `${providerId}/${folder.name}/${file.name}`);
        if (paths.length) expect((await bucket.remove(paths)).error).toBeNull();
      }
    }
    if (directPaths.length) expect((await bucket.remove(directPaths)).error).toBeNull();
  }
  if (availabilityId) await admin.from("availability_rules").delete().eq("id", availabilityId);
  if (providerServiceId) await admin.from("provider_services").delete().eq("id", providerServiceId);
  if (providerId) await admin.auth.admin.deleteUser(providerId);
  if (clientId) await admin.auth.admin.deleteUser(clientId);
  if (moderatorId) await admin.auth.admin.deleteUser(moderatorId);
  if (superId) await admin.auth.admin.deleteUser(superId);
});

test("le prestataire publie une vidéo réelle depuis Studio", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  if (bypass) await page.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Publier une vidéo" }).click();
  await page.getByLabel("Adresse e-mail").fill(providerEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/pro/, { timeout: 30_000 });
  await page.goto("/pro/videos");
  const videoContext = await browser.newContext({ viewport: { width: 360, height: 640 }, recordVideo: { dir: testInfo.outputPath("studio-media"), size: { width: 360, height: 640 } } });
  const recordedPage = await videoContext.newPage();
  await recordedPage.setContent('<style>html,body{margin:0;height:100%;display:grid;place-items:center;color:white;background:linear-gradient(145deg,#5b0b45,#d83f8c);font:28px sans-serif}</style><strong>Mata Beauty E2E</strong>');
  const recording = recordedPage.video();
  // L’encodage Playwright démarre après l’initialisation de la page : conserver
  // une marge suffisante pour produire un média réellement supérieur à 1 s.
  await recordedPage.waitForTimeout(5000);
  await videoContext.close();
  const videoPath = await recording!.path();
  await page.locator('input[name="video"]').setInputFiles(videoPath);
  await page.locator('input[name="title"]').fill(`Studio réel ${run}`);
  await page.locator('textarea[name="caption"]').fill(studioCaption);
  await page.locator('input[name="hashtags"]').fill("#tresses #dakar #studioe2e");
  await page.locator('input[name="location"]').fill("Dakar");
  await page.locator('select[name="serviceId"]').selectOption(providerServiceId);
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Publier la vidéo" }).click();
  await expect(page.getByText("100% · Terminé")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Publication visible dans Inspiration.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Studio réel ${run}`)).toBeVisible({ timeout: 30_000 });
  const created = await admin.from("posts").select("id,status,post_services(provider_service_id,is_primary)").eq("author_id", providerId).eq("title", `Studio réel ${run}`).single();
  expect(created.error).toBeNull();
  expect(created.data).toMatchObject({ status: "published", post_services: [{ provider_service_id: providerServiceId, is_primary: true }] });
  studioPostId = created.data!.id;
  await page.reload();
  await page.getByRole("button", { name: "Mes vidéos" }).click();
  await expect(page.getByText(`Studio réel ${run}`)).toBeVisible({ timeout: 20_000 });
  await page.goto("/");
  await expect(page.getByText(studioCaption)).toBeVisible({ timeout: 20_000 });
  const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const clientPage = await clientContext.newPage();
  if (bypass) await clientPage.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await clientPage.goto("/");
  await clientPage.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await clientPage.getByLabel("Adresse e-mail").fill(clientEmail);
  await clientPage.getByLabel("Mot de passe").fill(password);
  await clientPage.getByRole("button", { name: "Se connecter", exact: true }).click();
  await clientPage.goto("/");
  const publishedCard = clientPage.locator(".social-video-card").filter({ hasText: studioCaption });
  await expect(publishedCard).toBeVisible({ timeout: 20_000 });
  await expect(publishedCard.locator("video")).toBeVisible();
  await clientContext.close();
});

test("le Studio accepte de vrais conteneurs MP4 et MOV", async ({ page }) => {
  test.setTimeout(120_000);
  const fixtureDirectory = process.env.VIDEO_FORMAT_FIXTURE_DIR;
  test.skip(!fixtureDirectory, "Fixtures MP4/MOV temporaires requises pour ce contrôle de codec.");
  const fixtures = (["mp4", "mov"] as const).map((extension) => ({ extension, path: join(fixtureDirectory!, `mata-studio.${extension}`) }));
  for (const fixture of fixtures) expect(existsSync(fixture.path), `Fixture ${fixture.extension.toUpperCase()} absente`).toBeTruthy();

  if (bypass) await page.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Publier une vidéo" }).click();
  await page.getByLabel("Adresse e-mail").fill(providerEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/pro/, { timeout: 30_000 });
  await page.goto("/pro/videos");

  for (const fixture of fixtures) {
    const title = `Studio ${fixture.extension.toUpperCase()} réel ${run}`;
    await page.locator('input[name="video"]').setInputFiles(fixture.path);
    await page.locator('input[name="title"]').fill(title);
    await page.locator('textarea[name="caption"]').fill(`Conteneur ${fixture.extension.toUpperCase()} validé ${run}`);
    await page.locator('select[name="serviceId"]').selectOption(providerServiceId);
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: "Publier la vidéo" }).click();
    await expect(page.getByText("100% · Terminé")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });
    const stored = await admin.from("posts").select("id,status,social_post_media(storage_path)").eq("author_id", providerId).eq("title", title).single();
    expect(stored.error).toBeNull();
    expect(stored.data?.status).toBe("published");
    expect(stored.data?.social_post_media?.[0]?.storage_path).toMatch(new RegExp(`video\\.${fixture.extension}$`));
    if (fixture !== fixtures.at(-1)) await page.getByRole("button", { name: "Créer une publication" }).click();
  }
});

test("le Studio publie une photo et un avant-après réels dans Storage", async ({ page }) => {
  test.setTimeout(90_000);
  if (bypass) await page.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
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

test("le feed social distant relie les interactions au profil et à la réservation", async ({ page, browser }) => {
  test.setTimeout(90_000);
  if (remoteAppUrl && bypass) await page.route(`${new URL(remoteAppUrl).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(clientEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navigation de l’application" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(studioCaption)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(photoTitle)).toBeVisible();
  const beforeAfterCard = page.locator(".social-video-card").filter({ hasText: beforeAfterTitle });
  await expect(beforeAfterCard.getByRole("img", { name: "Avant" })).toBeVisible();
  await expect(beforeAfterCard.getByRole("img", { name: "Après" })).toBeVisible();
  const mainCard = page.locator(".social-video-card").filter({ hasText: studioCaption });
  const activeVideo = mainCard.locator("video");
  await expect(activeVideo).toBeVisible();
  await mainCard.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "auto" }));
  await expect(activeVideo).toHaveAttribute("preload", "auto");
  await expect.poll(() => activeVideo.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
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
  const feed = page.locator(".social-feed");
  await feed.evaluate((node) => node.scrollTo({ top: node.clientHeight, behavior: "auto" }));
  await expect.poll(() => activeVideo.evaluate((element) => (element as HTMLVideoElement).paused)).toBeTruthy();
  await expect.poll(() => page.locator(".social-video-card video").evaluateAll((elements) => (elements as HTMLVideoElement[]).filter((video) => !video.paused).length)).toBeLessThanOrEqual(1);
  await expect(page.locator(".social-video-card video").nth(1)).toHaveAttribute("preload", /^(metadata|none)$/);
  await feed.evaluate((node) => node.scrollTo({ top: 0, behavior: "auto" }));
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
  await page.getByRole("button", { name: "Vidéos", exact: true }).click();
  await expect(page.getByText(studioCaption)).toBeVisible();
  await page.getByRole("button", { name: "Prestations", exact: true }).click();
  await expect(page.getByText(`Tresses Preview ${run}`).first()).toBeVisible();
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
  if (bypass) await providerPage.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await providerPage.goto("/");
  await providerPage.getByRole("button", { name: "Publier une vidéo" }).click();
  await providerPage.getByLabel("Adresse e-mail").fill(providerEmail);
  await providerPage.getByLabel("Mot de passe").fill(password);
  await providerPage.getByRole("button", { name: "Se connecter", exact: true }).click();
  await providerPage.waitForURL(/\/pro/);
  await providerPage.goto("/pro/bookings");
  await expect(providerPage.locator(".workspace-list > div").first()).toBeVisible({ timeout: 20_000 });
  await providerPage.goto("/pro/videos");
  await providerPage.getByRole("button", { name: "Statistiques" }).click();
  await expect(providerPage.getByRole("heading", { name: "Performances" })).toBeVisible();
  await expect(providerPage.getByText(/1 réservations/)).toBeVisible();
  await providerPage.getByRole("button", { name: "Commentaires", exact: true }).click();
  await expect(providerPage.getByText(`Super résultat ${run}`)).toBeVisible();
  await providerPage.getByRole("button", { name: "Modération", exact: true }).click();
  await expect(providerPage.getByText(/signalements sont traités par l’équipe Mata Beauty/i)).toBeVisible();
  await providerContext.close();
  const [like, save, follow, comment] = await Promise.all([
    admin.from("post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("profile_id", clientId),
    admin.from("post_saves").select("post_id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("profile_id", clientId),
    admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_provider_id", providerId).eq("follower_id", clientId),
    admin.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("author_id", clientId),
  ]);
  expect([like.count, save.count, follow.count, comment.count]).toEqual([1, 1, 1, 1]);

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Mes inspirations" })).toBeVisible();
  const collectionName = `Mariage ${run}`;
  await page.getByLabel("Nom de la collection").fill(collectionName);
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByText(new RegExp(`${collectionName} · 0`))).toBeVisible();
  await page.getByLabel(`Collection pour ${studioCaption}`).selectOption({ label: collectionName });
  await expect(page.getByText("Inspiration ajoutée à la collection.")).toBeVisible();
  await expect(page.getByText(new RegExp(`${collectionName} · 1`))).toBeVisible();

  const conversation = await clientApi.rpc("ensure_booking_conversation", { target_booking_id: bookingId });
  expect(conversation.error).toBeNull();
  expect((await clientApi.from("messages").insert({ conversation_id: conversation.data, sender_id: clientId, body: `Golden path cliente ${run}` })).error).toBeNull();
  expect((await providerApi.from("messages").insert({ conversation_id: conversation.data, sender_id: providerId, body: `Golden path artiste ${run}` })).error).toBeNull();
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
  if (bypass) await page.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(clientEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/");
  const reportedCard = page.locator(".social-video-card").filter({ hasText: studioCaption });
  page.once("dialog", (dialog) => dialog.accept());
  await reportedCard.getByRole("button", { name: "Signaler" }).click();
  await expect(page.getByText("Signalement transmis à la modération.")).toBeVisible();
  const report = await admin.from("reports").select("id,status,post_id").eq("post_id", studioPostId).eq("reporter_id", clientId).single();
  expect(report.error).toBeNull(); expect(report.data?.status).toBe("open");

  const forbidden = await providerApi.rpc("admin_moderate_social_post", { target_post_id: studioPostId, decision: "hide", reason: "Tentative interdite" });
  expect(forbidden.error).not.toBeNull();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  if (bypass) await adminPage.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await adminPage.goto(`${remoteAppUrl}/admin`);
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
  if (bypass) await page.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(clientEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/app/);
  const paginatedComments = Array.from({ length: 21 }, (_, index) => ({ post_id: studioPostId, author_id: clientId, body: `Commentaire paginé ${index + 1} ${run}` }));
  expect((await clientApi.from("post_comments").insert(paginatedComments)).error).toBeNull();
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/feed/);
  await expect(page.locator(".social-video-card")).toHaveCount(8);
  const feed = page.locator(".social-feed");
  await feed.evaluate((node) => node.scrollTo({ top: node.scrollHeight, behavior: "auto" }));
  await expect.poll(() => page.locator(".social-video-card").count()).toBeGreaterThan(8);
  for (const [filter, marker] of [["Make-up", "makeup"], ["Barbier", "barbier"], ["Tresses", "tresses"], ["Ongles", "ongles"]] as const) {
    await page.getByRole("button", { name: filter, exact: true }).click();
    await expect(page.getByText(new RegExp(`E2E ${marker}`)).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Tendances", exact: true }).click();
  await expect.poll(() => page.locator(".social-video-card").count()).toBeGreaterThanOrEqual(10);
  await page.getByRole("button", { name: "Rechercher dans les vidéos" }).click();
  await page.getByLabel("Rechercher vidéos, professionnels, prestations ou hashtags").fill(studioCaption);
  await expect(page.locator(".social-video-card")).toHaveCount(1);
  await page.getByLabel("Rechercher vidéos, professionnels, prestations ou hashtags").fill("");
  await page.getByRole("button", { name: "#tresses", exact: true }).first().click();
  await expect(page).toHaveURL(/hashtag=tresses/);
  await expect(page.locator(".social-video-card")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Effacer le filtre hashtag" }).click();
  await page.getByRole("button", { name: "Abonnements", exact: true }).click();
  await expect(page.locator(".social-video-card")).not.toHaveCount(0);
  await expect(page.locator(".social-video-card").first()).toHaveAttribute("aria-label", "Publication de Mata Feed Pro");
  await expect(page.locator(".follower-count").first()).toContainText(/\d/);
  await page.getByRole("button", { name: "Pour toi", exact: true }).click();
  const studioCard = page.locator(".social-video-card").filter({ hasText: studioCaption });
  await studioCard.getByRole("button", { name: "Commentaires" }).click();
  await expect(page.locator(".comments-sheet article")).toHaveCount(20);
  await page.getByRole("button", { name: "Afficher plus de commentaires" }).click();
  await expect.poll(() => page.locator(".comments-sheet article").count()).toBeGreaterThan(20);
});

test("le parcours réel reste utilisable sur les cinq largeurs mobiles", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const width of [320, 360, 375, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: width <= 360 ? 740 : width <= 390 ? 844 : 932 } });
    const page = await context.newPage();
    if (bypass) await page.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
    await page.goto("/");
    await page.getByRole("button", { name: "Profil" }).click();
    await page.getByLabel("Adresse e-mail").fill(clientEmail);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.waitForURL(/\/app/);
    await page.goto("/");
    await expect(page.getByText(`Transformation Preview ${run}`)).toBeVisible({ timeout: 20_000 });
    const mobileCard = page.locator(".social-video-card").filter({ hasText: `Transformation Preview ${run}` });
    await mobileCard.getByRole("button", { name: "Profil de Mata Feed Pro" }).click();
    await expect(page.getByText("Mata Feed Pro").first()).toBeVisible();
    await page.getByRole("button", { name: "Retour" }).click();
    await expect(page.getByText(`Transformation Preview ${run}`)).toBeVisible();
    await mobileCard.getByRole("button", { name: "Réserver", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Réserver" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await context.close();
  }
});
