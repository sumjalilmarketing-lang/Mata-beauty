import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REMOTE_SUPABASE_URL ?? "";
const anonKey = process.env.REMOTE_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const remoteAppUrl = process.env.REMOTE_APP_URL;
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `Mata-UI-${randomUUID()}!`;
const clientEmail = `codex-ui-client-${runId}@example.test`;
const providerEmail = `codex-ui-provider-${runId}@example.test`;
const clientMessage = `Message cliente UI ${runId}`;
const providerMessage = `Réponse professionnelle UI ${runId}`;

let admin: SupabaseClient;
let clientId = "";
let providerId = "";
let providerServiceId = "";
let bookingId = "";
let conversationId = "";

async function createUser(email: string, professionalIntent = false) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: professionalIntent ? "Mata Pro UI" : "Mata Cliente UI",
      legal_accepted: "true",
      professional_intent: professionalIntent ? "true" : "false",
    },
  });
  expect(error).toBeNull();
  expect(data.user).toBeTruthy();
  return data.user!.id;
}

async function signIn(page: Page, email: string, entry: "Profil" | "Publier") {
  if (remoteAppUrl && vercelBypass) {
    await page.route(`${new URL(remoteAppUrl).origin}/**`, async (route) => {
      await route.continue({ headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass": vercelBypass,
        "x-vercel-set-bypass-cookie": "true",
      } });
    });
  }
  await page.goto("/");
  const connectivity = await page.evaluate(async ({ endpoint, key }) => {
    try {
      const response = await fetch(`${endpoint}/auth/v1/settings`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(15_000),
      });
      return { ok: response.ok, status: response.status, error: "" };
    } catch (error) {
      return { ok: false, status: 0, error: error instanceof Error ? error.message : "unknown" };
    }
  }, { endpoint: supabaseUrl, key: anonKey });
  expect(connectivity).toEqual({ ok: true, status: 200, error: "" });
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: entry }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByText("Données limitées par vos droits")).toBeVisible({ timeout: 20_000 });
}

test.beforeAll(async () => {
  expect(supabaseUrl).toMatch(/^https:\/\//);
  expect(anonKey.length).toBeGreaterThan(20);
  expect(serviceRoleKey.length).toBeGreaterThan(20);
  admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  clientId = await createUser(clientEmail);
  providerId = await createUser(providerEmail, true);
  expect((await admin.from("profiles").update({ role: "provider" }).eq("id", providerId)).error).toBeNull();
  expect((await admin.from("provider_profiles").upsert({
    profile_id: providerId,
    business_name: `Mata Pro UI ${runId}`,
    slug: `mata-pro-ui-${runId}`.toLowerCase(),
    status: "approved",
    city: "Dakar",
  }, { onConflict: "profile_id" })).error).toBeNull();

  const { data: baseService, error: baseServiceError } = await admin
    .from("services")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();
  expect(baseServiceError).toBeNull();

  const { data: providerService, error: providerServiceError } = await admin
    .from("provider_services")
    .insert({
      provider_id: providerId,
      service_id: baseService!.id,
      title: `Messagerie UI ${runId}`,
      duration_minutes: 60,
      price_amount: 10_000,
      currency: "XOF",
      is_active: true,
    })
    .select("id")
    .single();
  expect(providerServiceError).toBeNull();
  providerServiceId = providerService!.id;

  const startsAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(11, 0, 0, 0);
  const availabilityDate = startsAt.toISOString().slice(0, 10);
  const { error: availabilityError } = await admin.from("availability_rules").insert({ provider_id: providerId, weekday: startsAt.getUTCDay(), starts_at: "09:00", ends_at: "18:00", slot_interval_minutes: 30, valid_from: availabilityDate, valid_until: availabilityDate });
  expect(availabilityError).toBeNull();
  const clientApi = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: clientSignInError } = await clientApi.auth.signInWithPassword({ email: clientEmail, password });
  expect(clientSignInError).toBeNull();
  const { data: booking, error: bookingError } = await clientApi.from("bookings").insert({
    client_id: clientId,
    provider_id: providerId,
    provider_service_id: providerServiceId,
    starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
    location_mode: "salon",
    total_amount: 10_000,
    currency: "XOF",
  }).select("id").single();
  expect(bookingError).toBeNull();
  bookingId = booking!.id;
  await clientApi.auth.signOut({ scope: "local" });
});

test.afterAll(async () => {
  if (!admin) return;
  if (conversationId) await admin.from("conversations").delete().eq("id", conversationId);
  if (bookingId) await admin.from("bookings").delete().eq("id", bookingId);
  if (providerServiceId) await admin.from("provider_services").delete().eq("id", providerServiceId);
  if (providerId) await admin.auth.admin.deleteUser(providerId);
  if (clientId) await admin.auth.admin.deleteUser(clientId);
});

test("la cliente et le professionnel échangent réellement depuis l’interface", async ({ browser }) => {
  test.setTimeout(60_000);
  const clientContext = await browser.newContext();
  const providerContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  const providerPage = await providerContext.newPage();

  await signIn(clientPage, clientEmail, "Profil");
  await clientPage.getByRole("link", { name: "Messages", exact: true }).click();
  const clientBooking = clientPage.locator(".live-appointment").filter({ hasText: `Messagerie UI ${runId}` });
  await expect(clientBooking).toBeVisible();
  await clientBooking.getByRole("button", { name: "Messages" }).click();
  await expect(clientPage.locator("#conversation-title")).toBeVisible();
  await clientPage.getByLabel("Votre message").fill(clientMessage);
  await clientPage.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(clientPage.getByText(clientMessage)).toBeVisible();

  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("booking_id", bookingId)
    .single();
  conversationId = conversation!.id;

  await signIn(providerPage, providerEmail, "Profil");
  await providerPage.locator(".workspace-sidebar").getByRole("link", { name: "Notifications", exact: true }).click();
  await expect(providerPage.getByText("Nouveau message", { exact: true })).toBeVisible();
  await providerPage.getByRole("link", { name: "Messages", exact: true }).click();
  const providerBooking = providerPage.locator(".live-appointment").filter({ hasText: `Messagerie UI ${runId}` });
  await providerBooking.getByRole("button", { name: "Messages" }).click();
  await expect(providerPage.getByText(clientMessage)).toBeVisible();
  await expect(clientPage.getByText("Lu", { exact: true })).toBeVisible();

  await providerPage.getByLabel("Votre message").fill(providerMessage);
  await providerPage.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(clientPage.getByText(providerMessage)).toBeVisible({ timeout: 15_000 });
  await expect(providerPage.getByText("Lu", { exact: true })).toBeVisible({ timeout: 15_000 });

  await clientContext.close();
  await providerContext.close();
});
