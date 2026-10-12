import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sourceMessageMediaPath } from "@/lib/messaging/storage-path";

const url = process.env.REMOTE_SUPABASE_URL ?? "";
const anon = process.env.REMOTE_SUPABASE_ANON_KEY ?? "";
const qaProject = "https://kazlvtxkbsdhbfvtqqdp.supabase.co";
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const run = randomUUID();
const suffix = run.replace(/[0-9]/g, digit => String.fromCharCode(97 + Number(digit)));
const password = `QA-Conversation-${randomUUID()}!`;
const accounts: { id: string; email: string }[] = [];
let admin: SupabaseClient;
let serviceId = "";
let conversationId = "";
const serviceTitle = `Prestation conversation ${suffix}`;
const bookingDay = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

async function login(page: Page, email: string) {
  const app = process.env.REMOTE_APP_URL;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (app && bypass) await page.route(`${new URL(app).origin}/**`, route => route.continue({ headers: {
    ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true",
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Se connecter à MATA Beauty", exact: true }).first().click();
  await page.getByLabel("Adresse e-mail", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Se déconnecter", exact: true })).toBeVisible({ timeout: 15000 });
}

test.beforeAll(async () => {
  test.setTimeout(120000);
  expect(url).toBe(qaProject);
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", options);
  for (const role of ["client", "provider", "outsider"]) {
    const email = `codex-conversation-${role}-${run}@example.test`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { qa_suppress_email: true }, user_metadata: {
      legal_accepted: true, professional_intent: role === "provider", display_name: `Conversation ${role}`,
    } });
    expect(result.error).toBeNull(); accounts.push({ id: result.data.user!.id, email });
  }
  // New auth identities need the same app-level status synchronization as a
  // real first session before their role fixtures are enabled in isolated QA.
  for (const account of accounts) {
    const session = createClient(url, anon, options);
    expect((await session.auth.signInWithPassword({ email: account.email, password })).error).toBeNull();
    expect((await session.rpc("synchronize_account_status")).error).toBeNull();
  }
  expect((await admin.from("profiles").update({ role: "provider", country_code: "SN" }).eq("id", accounts[1].id)).error).toBeNull();
  expect((await admin.from("provider_profiles").upsert({ profile_id: accounts[1].id, business_name: "Salon conversation QA", slug: `conversation-${run}`, status: "approved", city: "Dakar", base_address: "Adresse de recette à Dakar", service_mode: "salon" }, { onConflict: "profile_id" })).error).toBeNull();
  const reference = await admin.from("services").select("id").eq("is_active", true).limit(1).single(); expect(reference.error).toBeNull();
  const service = await admin.from("provider_services").insert({ provider_id: accounts[1].id, service_id: reference.data!.id, title: serviceTitle, duration_minutes: 60, price_amount: 15000, currency: "XOF", is_active: true }).select("id").single();
  expect(service.error).toBeNull(); serviceId = service.data!.id;
  expect((await admin.from("availability_rules").insert(Array.from({ length: 7 }, (_, weekday) => ({ provider_id: accounts[1].id, weekday, starts_at: "09:00", ends_at: "18:00", slot_interval_minutes: 30 })))).error).toBeNull();
});

test.afterAll(async () => {
  if (!admin) return;
  if (accounts[1]) expect.soft((await admin.from("bookings").delete().eq("provider_id", accounts[1].id)).error).toBeNull();
  if (conversationId) {
    const files = await admin.from("message_attachments").select("storage_path").eq("conversation_id", conversationId);
    const paths = (files.data ?? []).flatMap(row => [row.storage_path as string, sourceMessageMediaPath(row.storage_path as string)]);
    if (paths.length) expect.soft((await admin.storage.from("message-attachments").remove([...new Set(paths)])).error).toBeNull();
    const quotes = await admin.from("conversation_quotes").select("id").eq("conversation_id", conversationId);
    expect.soft(quotes.error).toBeNull();
    const quoteIds = (quotes.data ?? []).map(quote => quote.id as string);
    if (quoteIds.length) {
      expect.soft((await admin.from("conversation_quote_events").delete().in("quote_id", quoteIds)).error).toBeNull();
      expect.soft((await admin.from("conversation_quotes").delete().in("id", quoteIds)).error).toBeNull();
    }
    expect.soft((await admin.from("conversations").delete().eq("id", conversationId)).error).toBeNull();
  }
  if (serviceId) expect.soft((await admin.from("provider_services").delete().eq("id", serviceId)).error).toBeNull();
  if (accounts[1]) expect.soft((await admin.from("availability_rules").delete().eq("provider_id", accounts[1].id)).error).toBeNull();
  for (const account of accounts.reverse()) expect.soft((await admin.auth.admin.deleteUser(account.id)).error).toBeNull();
});

test("conversation directe : texte, médias privés, catalogue, devis et reprise sans doublon", async ({ browser, request }, testInfo) => {
  test.setTimeout(360000);
  const clientContext = await browser.newContext({ serviceWorkers: "block" });
  const proContext = await browser.newContext({ serviceWorkers: "block" });
  const clientPage = await clientContext.newPage(); const proPage = await proContext.newPage();
  const errors: string[] = [];
  for (const page of [clientPage, proPage]) page.on("pageerror", error => {
    errors.push(error.stack ?? error.message);
    console.log("QA browser exception:", error.stack ?? error.message);
  });
  try {
    await login(clientPage, accounts[0].email);
    await clientPage.goto(`/app/messages?provider=${accounts[1].id}`);
    await expect(clientPage.locator("#conversation-title")).toHaveText("Salon conversation QA");
    const thread = clientPage.locator("#booking-conversation");
    const text = `Bonjour, je souhaite préparer ma prestation ${suffix}`;
    await clientPage.getByLabel("Votre message").fill(text);
    await clientPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(thread.locator(".message-bubble").filter({ hasText: text })).toBeVisible();
    const conversation = await admin.from("conversations").select("id").eq("client_id", accounts[0].id).eq("provider_id", accounts[1].id).is("booking_id", null).single();
    expect(conversation.error).toBeNull(); conversationId = conversation.data!.id;

    await login(proPage, accounts[1].email);
    await proPage.goto(`/pro/messages?conversation=${conversationId}`);
    await expect(proPage.locator("#booking-conversation .message-bubble").filter({ hasText: text })).toBeVisible();
    await proPage.getByLabel("Votre message").fill("Bienvenue, nous pouvons préparer votre prestation ici.");
    await proPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(thread.getByText("Bienvenue, nous pouvons préparer votre prestation ici.", { exact: true })).toBeVisible({ timeout: 20000 });

    // The server commits the message but its response is lost. Retrying must use
    // the original nonce, preserve the draft and create exactly one message.
    const retry = `Message avec réponse réseau perdue ${suffix}`;
    let lostResponse = false;
    await clientPage.route("**/rest/v1/rpc/send_conversation_message", async route => {
      if (!lostResponse) {
        const response = await route.fetch(); expect(response.ok()).toBe(true); lostResponse = true;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Interrupted response" }) });
      }
      return route.continue();
    });
    await clientPage.getByLabel("Votre message").fill(retry);
    await clientPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(thread.locator(".conversation-error").first()).toBeVisible();
    await expect(clientPage.getByLabel("Votre message")).toHaveValue(retry);
    await clientPage.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(clientPage.getByLabel("Votre message")).toHaveValue("");
    expect((await admin.from("messages").select("id").eq("conversation_id", conversationId).eq("body", retry)).data).toHaveLength(1);
    await clientPage.unroute("**/rest/v1/rpc/send_conversation_message");

    await clientPage.getByRole("button", { name: "Photo / vidéo", exact: true }).click();
    await clientPage.locator('input[type="file"]').setInputFiles({ name: "inspiration.png", mimeType: "image/png", buffer: await readFile("public/brand/icon-192.png") });
    await expect(clientPage.getByAltText("Aperçu de la photo avant envoi")).toBeVisible();
    await clientPage.getByRole("button", { name: "Envoyer le média", exact: true }).click();
    await expect(clientPage.getByText("Média envoyé.", { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(proPage.getByAltText("Photo partagée dans cette conversation")).toBeVisible({ timeout: 20000 });
    await expect.poll(() => proPage.getByAltText("Photo partagée dans cette conversation").evaluate(image => (image as HTMLImageElement).naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);
    const media = await admin.from("message_attachments").select("id,storage_path").eq("conversation_id", conversationId).eq("status", "ready").single(); expect(media.error).toBeNull();
    expect(media.data!.storage_path).toContain("-validated.");

    const outsider = createClient(url, anon, options);
    const outsiderSession = await outsider.auth.signInWithPassword({ email: accounts[2].email, password }); expect(outsiderSession.error).toBeNull();
    expect((await outsider.from("messages").select("id").eq("conversation_id", conversationId)).data).toEqual([]);
    expect((await outsider.from("message_attachments").select("id").eq("conversation_id", conversationId)).data).toEqual([]);
    const refused = await clientContext.request.get(`/api/messages/media?attachment=${media.data!.id}`, { headers: {
      Authorization: `Bearer ${outsiderSession.data.session!.access_token}`,
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
    } });
    expect(refused.status()).toBe(404);
    expect((await outsider.rpc("send_conversation_message", { target_conversation_id: conversationId, target_body: "Intrusion", target_client_nonce: randomUUID() })).error).toBeTruthy();
    await outsider.auth.signOut();

    const sample = await request.get("https://samplelib.com/mp4/sample-5s-360p.mp4"); expect(sample.ok()).toBe(true);
    await clientPage.locator('input[type="file"]').setInputFiles({ name: "inspiration.mp4", mimeType: "video/mp4", buffer: await sample.body() });
    await clientPage.getByRole("button", { name: "Envoyer le média", exact: true }).click();
    await expect(clientPage.getByText("Média envoyé.", { exact: true })).toBeVisible({ timeout: 30000 });
    const video = proPage.locator(".message-bubble video"); await expect(video).toBeVisible({ timeout: 30000 });
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
    expect(await video.evaluate(element => (element as HTMLVideoElement).duration)).toBeLessThanOrEqual(60);
    await video.evaluate(async element => { const player = element as HTMLVideoElement; player.muted = true; await player.play(); });
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
    await video.evaluate(element => (element as HTMLVideoElement).pause());

    // A forged extension/MIME must be rejected by validation on the server.
    await clientPage.locator('input[type="file"]').setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("This is not an image") });
    await clientPage.getByRole("button", { name: "Envoyer le média", exact: true }).click();
    await expect(clientPage.locator(".conversation-upload .conversation-error")).toBeVisible();
    expect((await admin.from("message_attachments").select("id").eq("conversation_id", conversationId).eq("status", "rejected")).data).toHaveLength(1);

    await proPage.getByRole("button", { name: "Partager une prestation", exact: true }).click();
    await proPage.getByLabel("Prestation à partager").selectOption(serviceId);
    await proPage.getByRole("button", { name: "Partager la prestation", exact: true }).click();
    const serviceCard = thread.locator(".conversation-service-card").filter({ hasText: serviceTitle }); await expect(serviceCard).toBeVisible();
    await expect(serviceCard.getByRole("link", { name: "Réserver", exact: true })).toHaveAttribute("href", `/?service=${serviceId}`);
    await proPage.getByRole("button", { name: "Partager le catalogue", exact: true }).click();
    await thread.getByText("Voir les 1 prestations", { exact: true }).click();
    await expect(thread.locator(".conversation-catalog").getByText(serviceTitle, { exact: true })).toBeVisible();

    await proPage.getByRole("button", { name: "Créer un devis", exact: true }).click();
    const quoteForm = proPage.locator(".conversation-quote-form");
    await expect(quoteForm).toBeVisible({ timeout: 10000 });
    await quoteForm.locator("select").selectOption(serviceId);
    await quoteForm.locator("textarea[name=description]").fill("Prestation personnalisée discutée dans la conversation.");
    await quoteForm.locator("input[type=number]").nth(0).fill("18000");
    await quoteForm.locator("input[type=number]").nth(1).fill("75");
    await quoteForm.locator("textarea[name=conditions]").fill("Merci de vous présenter à l’heure convenue.");
    await quoteForm.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    await proPage.getByText("Mes brouillons de devis (1)", { exact: true }).click();
    const draft = proPage.locator(".conversation-drafts .conversation-quote-card");
    await expect(draft.getByText("Brouillon", { exact: true })).toBeVisible();
    await draft.getByRole("button", { name: "Envoyer le devis", exact: true }).click();
    await draft.getByRole("button", { name: "Confirmer", exact: true }).click();
    const clientQuote = thread.locator(".conversation-quote-card");
    await expect(clientQuote.getByText("Envoyé", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(clientQuote).toContainText("75 min");
    await clientQuote.getByRole("button", { name: "Accepter le devis", exact: true }).click();
    await clientQuote.getByRole("button", { name: "Confirmer", exact: true }).click();
    await expect(clientQuote.getByText("Accepté", { exact: true })).toBeVisible();
    await expect(clientQuote.getByRole("link", { name: "Choisir un créneau et réserver" })).toHaveAttribute("href", /^\/quotes\/[0-9a-f-]{36}$/);
    const quotes = await admin.from("conversation_quotes").select("id,status,total_amount,duration_minutes").eq("conversation_id", conversationId); expect(quotes.error).toBeNull();
    expect(quotes.data).toHaveLength(1); expect(quotes.data![0]).toMatchObject({ status: "accepted", total_amount: 18000, duration_minutes: 75 });

    await clientQuote.getByRole("link", { name: "Choisir un créneau et réserver" }).click();
    await expect(clientPage).toHaveURL(new RegExp(`/quotes/${quotes.data![0].id}$`));
    await clientPage.getByLabel("Date du rendez-vous").fill(bookingDay);
    const slots = clientPage.getByRole("group", { name: "Créneaux disponibles" });
    await expect(slots.getByRole("button").first()).toBeVisible();
    await slots.getByRole("button").first().click();
    await clientPage.getByRole("button", { name: "Voir le récapitulatif", exact: true }).click();
    const recap = clientPage.getByRole("region", { name: "Récapitulatif de réservation" });
    await expect(recap).toContainText(/18\s*000/); await expect(recap).toContainText("75 min");
    await clientPage.getByRole("button", { name: "Créer le rendez-vous", exact: true }).click();
    await expect(clientPage.getByRole("heading", { name: "Rendez-vous enregistré", exact: true })).toBeVisible();
    const booking = await admin.from("bookings").select("id,status,total_amount,currency,starts_at,ends_at,conversation_id").eq("conversation_quote_id", quotes.data![0].id).single();
    expect(booking.error).toBeNull(); expect(booking.data).toMatchObject({ status: "pending", total_amount: 18000, currency: "XOF", conversation_id: conversationId });
    expect((Date.parse(booking.data!.ends_at) - Date.parse(booking.data!.starts_at)) / 60000).toBe(75);
    await clientPage.getByRole("link", { name: "Voir dans Rendez-vous", exact: true }).click();
    await expect(clientPage.locator(`#booking-${booking.data!.id}`)).toBeVisible();
    await proPage.goto(`/pro/bookings#booking-${booking.data!.id}`);
    const proBooking = proPage.locator(`#booking-${booking.data!.id}`); await expect(proBooking).toBeVisible();
    await expect(proBooking).toContainText(serviceTitle); await expect(proBooking).toContainText(/18\s*000/);
    await proBooking.getByRole("button", { name: "Messages", exact: true }).click();
    await expect(proPage.locator("#booking-conversation .conversation-quote-card").getByText("Accepté", { exact: true })).toBeVisible();

    // Notification opening must retain its exact older message target, beyond page 1.
    const target = await admin.from("messages").select("id").eq("conversation_id", conversationId).eq("body", text).single(); expect(target.error).toBeNull();
    const oldTime = Date.now() - 3600000;
    const fillers = Array.from({ length: 55 }, (_, index) => ({ conversation_id: conversationId, sender_id: accounts[0].id, body: `Historique de recette ${String.fromCharCode(97 + index % 26)} ${suffix}`, message_type: "text", created_at: new Date(oldTime + index * 61000).toISOString() }));
    // These are explicit QA history fixtures with spaced timestamps; no rate-limit bypass in app flows.
    expect((await admin.from("messages").update({ created_at: new Date(oldTime - 61000).toISOString() }).eq("id", target.data!.id)).error).toBeNull();
    expect((await admin.from("messages").insert(fillers)).error).toBeNull();
    await clientPage.goto(`/app/messages?conversation=${conversationId}&message=${target.data!.id}`);
    await expect(clientPage.locator(`#message-${target.data!.id}`)).toBeInViewport();
    await expect(clientPage.locator(`#message-${target.data!.id}`)).toHaveClass(/message-highlighted/);
    await expect(clientPage.locator(".message-bubble")).toHaveCount(63);
    for (const viewport of [{ width: 393, height: 852 }, { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }]) {
      await clientPage.setViewportSize(viewport); await clientPage.getByLabel("Votre message").fill("Brouillon mobile\nDeuxième ligne");
      await clientPage.getByLabel("Votre message").focus(); await clientPage.getByRole("button", { name: "Envoyer", exact: true }).scrollIntoViewIfNeeded();
      await expect(clientPage.getByRole("button", { name: "Envoyer", exact: true })).toBeInViewport();
      expect(await clientPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await clientPage.locator("#booking-conversation").screenshot({ path: testInfo.outputPath(`conversation-${viewport.width}.png`) });
    }
    await clientPage.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(clientPage.locator(".conversation-inbox")).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await clientContext.close(); await proContext.close(); }
});
