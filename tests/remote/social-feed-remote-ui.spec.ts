import { randomUUID } from "node:crypto";
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
const studioCaption = `Publication Studio réelle ${run}`;
let admin: SupabaseClient;
let clientId = "";
let providerId = "";
let providerServiceId = "";
let availabilityId = "";
let bookingId = "";
let providerApi: SupabaseClient;
const extraPostIds: string[] = [];
let studioPostId = "";

test.describe.configure({ mode: "serial" });

async function createUser(email: string, professional = false) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: professional ? "Mata Feed Pro" : "Mata Feed Cliente", legal_accepted: "true", professional_intent: professional ? "true" : "false" } });
  expect(error).toBeNull(); return data.user!.id;
}

test.beforeAll(async () => {
  admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  clientId = await createUser(clientEmail);
  providerId = await createUser(providerEmail, true);
  await admin.from("provider_profiles").update({ status: "approved" }).eq("profile_id", providerId);
  const base = await admin.from("services").select("id").eq("is_active", true).limit(1).single();
  const service = await admin.from("provider_services").insert({ provider_id: providerId, service_id: base.data!.id, title: `Tresses Preview ${run}`, duration_minutes: 60, price_amount: 18000, currency: "XOF", is_active: true }).select("id").single();
  providerServiceId = service.data!.id;
  providerApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await providerApi.auth.signInWithPassword({ email: providerEmail, password })).error).toBeNull();
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
    for (const folder of folders ?? []) {
      const { data: files } = await bucket.list(`${providerId}/${folder.name}`, { limit: 100 });
      const paths = (files ?? []).map((file) => `${providerId}/${folder.name}/${file.name}`);
      if (paths.length) expect((await bucket.remove(paths)).error).toBeNull();
    }
  }
  if (availabilityId) await admin.from("availability_rules").delete().eq("id", availabilityId);
  if (providerServiceId) await admin.from("provider_services").delete().eq("id", providerServiceId);
  if (providerId) await admin.auth.admin.deleteUser(providerId);
  if (clientId) await admin.auth.admin.deleteUser(clientId);
});

test("le prestataire publie une vidéo réelle depuis Studio", async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000);
  if (bypass) await page.route(`${new URL(remoteAppUrl!).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Publier une vidéo" }).click();
  await page.getByLabel("Adresse e-mail").fill(providerEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/pro/);
  await page.goto("/pro/videos");
  const videoContext = await browser.newContext({ viewport: { width: 360, height: 640 }, recordVideo: { dir: testInfo.outputPath("studio-media"), size: { width: 360, height: 640 } } });
  const recordedPage = await videoContext.newPage();
  await recordedPage.setContent('<style>html,body{margin:0;height:100%;display:grid;place-items:center;color:white;background:linear-gradient(145deg,#5b0b45,#d83f8c);font:28px sans-serif}</style><strong>Mata Beauty E2E</strong>');
  const recording = recordedPage.video();
  await recordedPage.waitForTimeout(2200);
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
  await expect(page.getByText(`Studio réel ${run}`)).toBeVisible({ timeout: 30_000 });
  const created = await admin.from("posts").select("id,status,post_services(provider_service_id,is_primary)").eq("author_id", providerId).eq("title", `Studio réel ${run}`).single();
  expect(created.error).toBeNull();
  expect(created.data).toMatchObject({ status: "published", post_services: [{ provider_service_id: providerServiceId, is_primary: true }] });
  studioPostId = created.data!.id;
  await page.goto("/");
  await expect(page.getByText(studioCaption)).toBeVisible({ timeout: 20_000 });
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
  const mainCard = page.locator(".social-video-card").filter({ hasText: studioCaption });
  const activeVideo = mainCard.locator("video");
  await expect(activeVideo).toBeVisible();
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
  await expect(page.locator(".social-video-card").nth(2).locator("video")).toHaveAttribute("preload", "metadata");
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
  expect(notifications.data!.some((item) => item.kind === "booking_created")).toBeTruthy();
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
  await providerContext.close();
  const [like, save, follow, comment] = await Promise.all([
    admin.from("post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("profile_id", clientId),
    admin.from("post_saves").select("post_id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("profile_id", clientId),
    admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_provider_id", providerId).eq("follower_id", clientId),
    admin.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", studioPostId).eq("author_id", clientId),
  ]);
  expect([like.count, save.count, follow.count, comment.count]).toEqual([1, 1, 1, 1]);
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
  await page.goto("/");
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
