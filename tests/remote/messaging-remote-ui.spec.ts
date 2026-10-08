import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { completeQaMfa } from "./qa-mfa";

const supabaseUrl = process.env.REMOTE_SUPABASE_URL ?? "";
const anonKey = process.env.REMOTE_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const remoteAppUrl = process.env.REMOTE_APP_URL;
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `Mata-UI-${randomUUID()}!`;
const clientEmail = `codex-ui-client-${runId}@example.test`;
const providerEmail = `codex-ui-provider-${runId}@example.test`;
const messageRun = runId.replace(/[0-9]/g, (digit) => String.fromCharCode(97 + Number(digit)));
const clientMessage = `Message cliente UI ${messageRun}`;
const providerMessage = `Réponse professionnelle UI ${messageRun}`;

let admin: SupabaseClient;
let clientId = "";
let providerId = "";
let providerServiceId = "";
let bookingId = "";
const extraUserIds: string[] = [];

async function createUser(email: string, professionalIntent = false) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { qa_suppress_email: true },
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
  if (entry === "Publier") await page.getByRole("button", { name: "Publier une vidéo", exact: true }).click();
  else await page.getByRole("button", { name: "Se connecter à MATA Beauty", exact: true }).first().click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/(app|pro)(\/|$)/, { timeout: 20_000 });
  await expect(page.getByRole("navigation", { name: /Navigation Espace/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.beforeAll(async () => {
  expect(supabaseUrl).toMatch(/^https:\/\//);
  expect(supabaseUrl).toBe("https://kazlvtxkbsdhbfvtqqdp.supabase.co");
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
  expect((await admin.from("availability_rules").insert({
    provider_id: providerId, weekday: startsAt.getUTCDay(), starts_at: "09:00", ends_at: "18:00", slot_interval_minutes: 30,
  })).error).toBeNull();
  const clientApi = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: clientSignInError } = await clientApi.auth.signInWithPassword({ email: clientEmail, password });
  expect(clientSignInError).toBeNull();
  expect((await clientApi.rpc("synchronize_account_status")).error).toBeNull();
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
  if (clientId) expect.soft((await admin.from("support_tickets").delete().eq("requester_id", clientId)).error).toBeNull();
  for (const id of extraUserIds) expect.soft((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  if (bookingId) expect.soft((await admin.from("conversations").delete().eq("booking_id", bookingId)).error).toBeNull();
  if (clientId && providerId) expect.soft((await admin.from("bookings").delete().eq("client_id", clientId).eq("provider_id", providerId)).error).toBeNull();
  if (providerServiceId) expect.soft((await admin.from("provider_services").delete().eq("id", providerServiceId)).error).toBeNull();
  if (providerId) expect.soft((await admin.from("availability_rules").delete().eq("provider_id", providerId)).error).toBeNull();
  if (providerId) expect.soft((await admin.auth.admin.deleteUser(providerId)).error).toBeNull();
  if (clientId) expect.soft((await admin.auth.admin.deleteUser(clientId)).error).toBeNull();
});

test("support : échanges privés lisibles côté client et administration avec MFA", async ({ browser }, testInfo) => {
  test.skip(process.env.MESSAGING_BASELINE === "1", "Capture avant correction uniquement");
  test.setTimeout(240_000);
  const managerEmail = `codex-messaging-support-${runId}@example.test`;
  const managerId = await createUser(managerEmail); extraUserIds.push(managerId);
  const role = await admin.from("admin_roles").select("id").eq("key", "super_admin").single(); expect(role.error).toBeNull();
  expect((await admin.from("profiles").update({ role: "admin" }).eq("id", managerId)).error).toBeNull();
  expect((await admin.from("admin_user_roles").insert({ user_id: managerId, role_id: role.data!.id, requires_mfa: true })).error).toBeNull();
  const clientContext = await browser.newContext(), staffContext = await browser.newContext();
  try {
    const clientPage = await clientContext.newPage(), staffPage = await staffContext.newPage();
    await signIn(clientPage, clientEmail, "Profil");
    await clientPage.goto("/app/support");
    const subject = `Recette messagerie support ${messageRun}`;
    await clientPage.getByLabel("Objet (obligatoire)").fill(subject);
    await clientPage.locator("#client-support .collection-form").getByRole("button", { name: "Envoyer", exact: true }).click();
    await clientPage.getByRole("button", { name: subject, exact: true }).click();
    await clientPage.getByLabel("Réponse au support").fill("Bonjour, voici ma demande.\nMerci pour votre aide.");
    await clientPage.getByRole("button", { name: "Envoyer la réponse", exact: true }).click();
    await expect(clientPage.locator(".support-thread .message-bubble.own")).toContainText("Bonjour, voici ma demande.");
    await signIn(staffPage, managerEmail, "Profil");
    await staffPage.goto("/admin"); await completeQaMfa(staffPage);
    await staffPage.getByRole("navigation", { name: "Navigation Super Admin" }).getByRole("button", { name: /Support/ }).click();
    await staffPage.getByRole("button", { name: subject, exact: true }).click();
    await expect(staffPage.locator(".support-thread .message-bubble:not(.own)")).toContainText("Bonjour, voici ma demande.");
    await staffPage.getByLabel("Réponse au support").fill("Bonjour, votre demande a bien été reçue.");
    await staffPage.getByRole("button", { name: "Envoyer la réponse", exact: true }).click();
    await expect(staffPage.locator(".support-thread .message-bubble.own")).toContainText("votre demande a bien été reçue");
    await clientPage.getByRole("button", { name: "Actualiser les échanges", exact: true }).click();
    await expect(clientPage.locator(".support-thread .message-bubble:not(.own)")).toContainText("votre demande a bien été reçue");
    for (const colorScheme of ["light", "dark"] as const) {
      await staffPage.emulateMedia({ colorScheme });
      await staffPage.locator(".support-thread").screenshot({ path: testInfo.outputPath(`support-${colorScheme}.png`) });
      const pairs = await staffPage.locator(".support-thread .message-bubble").evaluateAll(elements => elements.map(element => ({
        background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element.querySelector("p")!).color,
      })));
      for (const pair of pairs) expect(pair.background).not.toBe(pair.text);
    }
    const ticket = await admin.from("support_tickets").select("id").eq("requester_id", clientId).eq("subject", subject).single(); expect(ticket.error).toBeNull();
    expect((await admin.from("support_messages").insert({ ticket_id: ticket.data!.id, sender_id: managerId, body: "Note interne confidentielle QA", is_internal: true })).error).toBeNull();
    await clientPage.getByRole("button", { name: "Actualiser les échanges", exact: true }).click();
    await expect(clientPage.getByText("Note interne confidentielle QA", { exact: true })).toHaveCount(0);
    const other = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await other.auth.signInWithPassword({ email: providerEmail, password })).error).toBeNull();
    expect((await other.from("support_messages").select("id").eq("ticket_id", ticket.data!.id)).data).toEqual([]);
    expect((await other.rpc("manage_support_ticket", { target_ticket_id: ticket.data!.id, target_action: "reply", target_message: "Interdit" })).error).toBeTruthy();
    await other.auth.signOut({ scope: "local" });
  } finally { await clientContext.close(); await staffContext.close(); }
});

test("la cliente et le professionnel échangent réellement depuis l’interface", async ({ browser }, testInfo) => {
  test.setTimeout(360_000);
  // Fault injection must intercept the request instead of a service worker.
  const clientContext = await browser.newContext({ serviceWorkers: "block" });
  const providerContext = await browser.newContext({ serviceWorkers: "block" });
  const clientPage = await clientContext.newPage();
  const providerPage = await providerContext.newPage();
  const scriptErrors: string[] = [];
  const navigationCancellations: string[] = [];
  let reloadingClient = false;
  for (const page of [clientPage, providerPage]) page.on("pageerror", error => {
    // WebKit reports an in-flight fetch torn down by a hard reload as a native
    // access-control error (HTTP status -1). Keep the evidence; never ignore an
    // access-control error outside this explicitly forced navigation window.
    if (page === clientPage && reloadingClient && error.message.includes("supabase.co/rest/v1/conversation_members?")
      && error.message.endsWith("due to access control checks.")) navigationCancellations.push(error.message);
    else scriptErrors.push(error.message);
  });

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
  expect(conversation?.id).toBeTruthy();

  await signIn(providerPage, providerEmail, "Publier");
  await providerPage.getByRole("link", { name: "Notifications", exact: true }).click();
  await expect(providerPage.locator(".notification-card").filter({ hasText: "Nouveau message" })).toBeVisible({ timeout: 15_000 });
  await providerPage.locator(".notification-card").filter({ hasText: "Nouveau message" }).getByRole("button", { name: "Ouvrir", exact: true }).click();
  const providerBooking = providerPage.locator(".live-appointment").filter({ hasText: `Messagerie UI ${runId}` });
  await expect(providerBooking).toBeVisible();
  await expect(providerPage.getByText(clientMessage)).toBeVisible();
  await expect(clientPage.getByText("Lu", { exact: true })).toBeVisible();

  await providerPage.getByLabel("Votre message").fill(providerMessage);
  await providerPage.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(clientPage.getByText(providerMessage)).toBeVisible({ timeout: 15_000 });
  await expect(providerPage.getByText("Lu", { exact: true })).toBeVisible({ timeout: 15_000 });

  await providerPage.locator("#booking-conversation").screenshot({ path: testInfo.outputPath("professional-conversation.png") });
  await clientPage.locator("#booking-conversation").screenshot({ path: testInfo.outputPath("client-conversation.png") });

  if (process.env.MESSAGING_BASELINE !== "1") {
    await expect(providerPage.locator("#conversation-title")).toHaveText("Mata Cliente UI");
    await expect(clientPage.locator("#conversation-title")).toHaveText(`Mata Pro UI ${runId}`);
    await expect(providerPage.locator(".conversation-context")).toContainText("En attente");
    const contrast = await providerPage.locator(".message-bubble").evaluateAll(bubbles => {
      const luminance = (color: string) => {
        const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return bubbles.map(bubble => {
        const background = luminance(getComputedStyle(bubble).backgroundColor);
        const ratio = (element: Element) => {
          const foreground = luminance(getComputedStyle(element).color);
          return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
        };
        return { own: bubble.classList.contains("own"), body: ratio(bubble.querySelector("p")!), time: ratio(bubble.querySelector("time")!) };
      });
    });
    for (const result of contrast) { expect(result.body).toBeGreaterThanOrEqual(4.5); expect(result.time).toBeGreaterThanOrEqual(4.5); }
    console.log("Message contrast ratios:", JSON.stringify(contrast));
    await testInfo.attach("contrast.json", { body: JSON.stringify(contrast), contentType: "application/json" });

    // Real server access checks: two unrelated accounts, including another Pro.
    for (const role of ["client", "provider"] as const) {
      const email = `codex-messaging-outsider-${role}-${runId}@example.test`;
      const id = await createUser(email, role === "provider"); extraUserIds.push(id);
      if (role === "provider") expect((await admin.from("profiles").update({ role }).eq("id", id)).error).toBeNull();
      const outsider = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: session, error } = await outsider.auth.signInWithPassword({ email, password }); expect(error).toBeNull();
      expect((await outsider.rpc("synchronize_account_status")).error).toBeNull();
      const read = await outsider.from("messages").select("id").eq("conversation_id", conversation!.id);
      expect(read.error).toBeNull(); expect(read.data).toEqual([]);
      expect((await outsider.rpc("ensure_booking_conversation", { target_booking_id: bookingId })).error).toBeTruthy();
      expect((await outsider.from("messages").insert({ conversation_id: conversation!.id, sender_id: id, body: "Accès interdit" })).error).toBeTruthy();
      expect((await outsider.from("conversation_members").insert({ conversation_id: conversation!.id, profile_id: id })).error).toBeTruthy();
      const response = await clientContext.request.get(`/api/bookings/conversation-context?booking=${bookingId}`, { headers: {
        Authorization: `Bearer ${session.session!.access_token}`, ...(vercelBypass ? { "x-vercel-protection-bypass": vercelBypass } : {}),
      } });
      expect(response.status()).toBe(404);
      await outsider.auth.signOut({ scope: "local" });
    }

    const repeated = `Double clic ${messageRun}`;
    await clientPage.getByLabel("Votre message").fill(repeated);
    await clientPage.getByRole("button", { name: "Envoyer", exact: true }).dblclick();
    await expect(providerPage.getByText(repeated, { exact: true })).toBeVisible({ timeout: 15_000 });
    const repeatedRows = await admin.from("messages").select("id").eq("conversation_id", conversation!.id).eq("body", repeated);
    expect(repeatedRows.error).toBeNull(); expect(repeatedRows.data).toHaveLength(1);

    const retryText = `Texte conservé après erreur ${messageRun}`;
    let injectedFailures = 0;
    await clientPage.route("**/rest/v1/messages**", route => {
      if (route.request().method() !== "POST") return route.continue();
      injectedFailures++;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Service indisponible" }) });
    });
    await clientPage.getByLabel("Votre message").fill(retryText);
    await clientPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect.poll(() => injectedFailures).toBeGreaterThan(0);
    await expect(clientPage.locator(".conversation-error")).toBeVisible({ timeout: 15_000 });
    await expect(clientPage.getByLabel("Votre message")).toHaveValue(retryText);
    await clientPage.unroute("**/rest/v1/messages**");
    await clientPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(providerPage.getByText(retryText, { exact: true })).toBeVisible({ timeout: 15_000 });

    const longMessage = `Message long ${messageRun}\n${"Une information utile pour notre rendez-vous. ".repeat(60)}\nDernière ligne.`;
    await providerPage.getByLabel("Votre message").fill(longMessage);
    await providerPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(clientPage.locator(".message-bubble p").filter({ hasText: `Message long ${messageRun}` })).toHaveText(longMessage, { timeout: 15_000 });
    reloadingClient = true;
    try { await clientPage.reload(); } finally { reloadingClient = false; }
    await clientPage.locator(".live-appointment").filter({ hasText: `Messagerie UI ${runId}` }).getByRole("button", { name: "Messages" }).click();
    await expect(clientPage.locator(".message-bubble p").filter({ hasText: `Message long ${messageRun}` })).toHaveText(longMessage);

    for (const viewport of [{ width: 393, height: 852 }, { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }]) {
      await clientPage.setViewportSize(viewport);
      await clientPage.getByLabel("Votre message").fill("Brouillon visible\nDeuxième ligne");
      await clientPage.getByLabel("Votre message").focus();
      const send = clientPage.getByRole("button", { name: "Envoyer", exact: true });
      await send.scrollIntoViewIfNeeded();
      await expect(send).toBeInViewport();
      expect(await clientPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await clientPage.locator(".message-list").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await clientPage.locator(".message-list").evaluate(element => { element.scrollTop = 0; });
      expect(await clientPage.locator(".message-list").evaluate(element => element.scrollTop)).toBe(0);
      await clientPage.locator("#booking-conversation").screenshot({ path: testInfo.outputPath(`conversation-${viewport.width}.png`) });
    }
    // Reduced visual space simulates an open keyboard; physical keyboards remain a separate check.
    await clientPage.setViewportSize({ width: 393, height: 380 });
    await clientPage.getByLabel("Votre message").focus();
    await clientPage.getByRole("button", { name: "Envoyer", exact: true }).scrollIntoViewIfNeeded();
    await expect(clientPage.getByRole("button", { name: "Envoyer", exact: true })).toBeInViewport();
    await expect(clientPage.getByLabel("Votre message")).toHaveValue("Brouillon visible\nDeuxième ligne");

    await providerPage.getByRole("link", { name: "Agenda", exact: true }).click();
    await providerPage.locator(".live-appointment").filter({ hasText: `Messagerie UI ${runId}` }).getByRole("button", { name: "Messages" }).click();
    await expect(providerPage.locator("#conversation-title")).toHaveText("Mata Cliente UI");
    await expect(providerPage.getByText(clientMessage, { exact: true })).toBeAttached();
    await providerPage.locator("#booking-conversation").screenshot({ path: testInfo.outputPath("professional-agenda.png") });
    await clientPage.setViewportSize({ width: 1366, height: 768 });
    await clientPage.goto("/app/notifications");
    const receivedNotification = clientPage.locator(".notification-card").filter({ hasText: "Nouveau message" }).first();
    await expect(receivedNotification).toBeVisible();
    await receivedNotification.getByRole("button", { name: "Ouvrir", exact: true }).click();
    await expect(clientPage.locator("#conversation-title")).toHaveText(`Mata Pro UI ${runId}`);
    expect(scriptErrors).toEqual([]);
    await testInfo.attach("navigation-cancellations.json", { body: JSON.stringify(navigationCancellations), contentType: "application/json" });
  }

  await clientContext.close();
  await providerContext.close();
});
