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
let admin: SupabaseClient;
let clientId = "";
let providerId = "";
let providerServiceId = "";
let postId = "";

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
  const providerApi = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await providerApi.auth.signInWithPassword({ email: providerEmail, password })).error).toBeNull();
  const post = await providerApi.rpc("create_video_post", { target_caption: `Transformation Preview ${run}`, target_video_url: `${supabaseUrl}/storage/v1/object/public/social-videos/${providerId}/preview-${run}.mp4`, target_thumbnail_url: null, target_duration_seconds: 20, target_aspect_ratio: 0.562, target_provider_service_id: providerServiceId, target_status: "published", target_allow_comments: true, target_client_consent: true, target_scheduled_for: null, target_visibility: "public", target_hashtags: ["preview", "tresses"] });
  expect(post.error).toBeNull(); postId = post.data;
});

test.afterAll(async () => {
  if (postId) await admin.from("posts").delete().eq("id", postId);
  if (providerServiceId) await admin.from("provider_services").delete().eq("id", providerServiceId);
  if (providerId) await admin.auth.admin.deleteUser(providerId);
  if (clientId) await admin.auth.admin.deleteUser(clientId);
});

test("le feed social distant relie les interactions au profil et à la réservation", async ({ page }) => {
  if (remoteAppUrl && bypass) await page.route(`${new URL(remoteAppUrl).origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Profil" }).click();
  await page.getByLabel("Adresse e-mail").fill(clientEmail);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByText("Données Supabase")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Mata Beauty/ }).first().click();
  await expect(page.getByText(`Transformation Preview ${run}`)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "J’aime" }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByRole("button", { name: "Suivre" }).click();
  await page.getByRole("button", { name: "Commentaires" }).click();
  await page.getByLabel("Ajouter un commentaire").fill(`Super résultat ${run}`);
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(page.getByText(`Super résultat ${run}`)).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Voir le profil" }).click();
  await expect(page.getByText("Mata Feed Pro").first()).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByText(`Transformation Preview ${run}`)).toBeVisible();
  await page.getByRole("button", { name: "Réserver" }).click();
  await expect(page.getByRole("heading", { name: "Réserver" })).toBeVisible();
  await expect(page.getByText(`Tresses Preview ${run}`).first()).toBeVisible();
  const [like, save, follow, comment] = await Promise.all([
    admin.from("post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", postId).eq("profile_id", clientId),
    admin.from("post_saves").select("post_id", { count: "exact", head: true }).eq("post_id", postId).eq("profile_id", clientId),
    admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_provider_id", providerId).eq("follower_id", clientId),
    admin.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", postId).eq("author_id", clientId),
  ]);
  expect([like.count, save.count, follow.count, comment.count]).toEqual([1, 1, 1, 1]);
});
