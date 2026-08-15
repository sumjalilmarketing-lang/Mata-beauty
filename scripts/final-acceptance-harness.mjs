import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
let state = null;
let createSupabaseClient = null;

function client(url, key) {
  assert.ok(createSupabaseClient, "Fabrique Supabase manquante");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function record(results, name, passed, details = "") {
  results.push({ name, passed, details });
  assert.ok(passed, `${name}${details ? `: ${details}` : ""}`);
}

async function createAccount(admin, url, anonKey, runId, role, professional = false) {
  const email = `codex-final-${role}-${runId}@example.test`;
  const password = `Mata-${role}-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: `Recette ${role}`,
      legal_accepted: "true",
      professional_intent: professional ? "true" : "false",
    },
  });
  assert.ifError(created.error);
  assert.ok(created.data.user);
  const supabase = client(url, anonKey);
  const signed = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  return { role, id: created.data.user.id, email, password, supabase };
}

export async function startFinalAcceptance({ url, anonKey, serviceKey, previewUrl, createClient }) {
  assert.ok(url && anonKey && serviceKey && previewUrl, "Configuration distante incomplète");
  assert.equal(typeof createClient, "function", "Client Supabase requis");
  assert.equal(state, null, "Une recette est déjà active");
  createSupabaseClient = createClient;
  const admin = client(url, serviceKey);
  const runId = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const accounts = {};
  const results = [];
  const created = { bookingIds: [], serviceIds: [], businessIds: [], categoryIds: [], availabilityIds: [], collaboratorIds: [], conversationIds: [] };
  state = { admin, accounts, created, previewUrl, results };

  try {
    accounts.client = await createAccount(admin, url, anonKey, runId, "client");
    accounts.provider = await createAccount(admin, url, anonKey, runId, "provider", true);
    accounts.salon = await createAccount(admin, url, anonKey, runId, "salon", true);
    accounts.admin = await createAccount(admin, url, anonKey, runId, "admin");
    accounts.super_admin = await createAccount(admin, url, anonKey, runId, "super-admin");
    accounts.outsider = await createAccount(admin, url, anonKey, runId, "outsider");

    const roles = await admin.from("admin_roles").select("id,key").in("key", ["admin", "super_admin"]);
    assert.ifError(roles.error);
    const adminRole = roles.data.find((row) => row.key === "admin");
    const superRole = roles.data.find((row) => row.key === "super_admin");
    assert.ok(adminRole && superRole);
    assert.ifError((await admin.from("profiles").update({ role: "admin" }).in("id", [accounts.admin.id, accounts.super_admin.id])).error);
    assert.ifError((await admin.from("admin_user_roles").insert([
      { user_id: accounts.admin.id, role_id: adminRole.id, assigned_by: accounts.super_admin.id, is_active: true },
      { user_id: accounts.super_admin.id, role_id: superRole.id, assigned_by: accounts.admin.id, is_active: true },
    ])).error);

    const adminContext = await accounts.admin.supabase.rpc("get_admin_context");
    const superContext = await accounts.super_admin.supabase.rpc("get_admin_context");
    assert.ifError(adminContext.error); assert.ifError(superContext.error);
    record(results, "Rôles Admin et Super Admin distincts", adminContext.data?.is_super_admin === false && superContext.data?.is_super_admin === true);
    const forbiddenEscalation = await accounts.admin.supabase.rpc("admin_assign_role", { target_user_id: accounts.outsider.id, target_role_key: "super_admin", reason: "Recette finale" });
    record(results, "Un Admin ne peut pas nommer un Super Admin", Boolean(forbiddenEscalation.error));

    for (const role of ["client", "provider", "salon", "admin", "super_admin"]) {
      const synchronized = await accounts[role].supabase.rpc("synchronize_account_status");
      assert.ifError(synchronized.error);
      const profile = await accounts[role].supabase.from("profiles").select("id,account_status").eq("id", accounts[role].id).single();
      assert.ifError(profile.error);
      record(results, `Profil unique créé pour ${role}`, profile.data.id === accounts[role].id && profile.data.account_status === "active");
    }

    const baseService = await admin.from("services").select("id,category_id").eq("is_active", true).limit(1).single();
    assert.ifError(baseService.error);
    const providerProfile = await accounts.provider.supabase.rpc("save_professional_onboarding", {
      target_business_name: `Studio Recette ${runId}`,
      target_bio: "Professionnelle expérimentée, spécialisée dans les soins et coiffures premium à Dakar.",
      target_city: "Dakar",
      target_service_mode: "both",
      target_activity_type: "hairdresser",
      target_years_experience: 7,
      target_base_address: "Plateau, Dakar",
      target_languages: ["fr", "wo"],
      target_cancellation_policy: "Annulation gratuite jusqu'à vingt-quatre heures avant le rendez-vous.",
    });
    assert.ifError(providerProfile.error);
    const providerService = await accounts.provider.supabase.from("provider_services").insert({
      provider_id: accounts.provider.id,
      service_id: baseService.data.id,
      title: `Prestation finale ${runId}`,
      duration_minutes: 60,
      price_amount: 12500,
      currency: "XOF",
      is_active: true,
    }).select("id,price_amount,duration_minutes").single();
    assert.ifError(providerService.error); created.serviceIds.push(providerService.data.id);
    const availability = await accounts.provider.supabase.from("availability_rules").insert({
      provider_id: accounts.provider.id,
      weekday: 2,
      starts_at: "09:00",
      ends_at: "18:00",
      slot_interval_minutes: 30,
    }).select("id").single();
    assert.ifError(availability.error); created.availabilityIds.push(availability.data.id);
    record(results, "Prestataire : profil, prestation, prix, durée et disponibilité", providerProfile.data === 100 && providerService.data.price_amount === 12500 && providerService.data.duration_minutes === 60);

    const business = await accounts.salon.supabase.from("businesses").insert({
      owner_id: accounts.salon.id,
      name: `Salon Recette ${runId}`,
      slug: `salon-recette-${runId}`.toLowerCase(),
      business_type: "salon",
      address: "Almadies, Dakar",
      city: "Dakar",
      status: "draft",
    }).select("id,name").single();
    assert.ifError(business.error); created.businessIds.push(business.data.id);
    const businessUpdate = await accounts.salon.supabase.from("businesses").update({ description: "Salon premium de recette finale." }).eq("id", business.data.id).select("description").single();
    assert.ifError(businessUpdate.error);
    const collaborator = await accounts.salon.supabase.from("collaborators").insert({
      business_id: business.data.id,
      profile_id: accounts.provider.id,
      display_name: "Collaboratrice Recette",
      title: "Coiffeuse",
      is_bookable: true,
      is_active: true,
    }).select("id").single();
    assert.ifError(collaborator.error); created.collaboratorIds.push(collaborator.data.id);
    record(results, "Salon : création, mise à jour et ajout d'équipe", businessUpdate.data.description.includes("premium") && Boolean(collaborator.data.id));

    const starts = new Date(Date.now() + 35 * 86400000); starts.setUTCHours(10, 0, 0, 0);
    const bookingPayload = {
      client_id: accounts.client.id,
      provider_id: accounts.outsider.id,
      provider_service_id: providerService.data.id,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 3600000).toISOString(),
      status: "pending",
      location_mode: "salon",
      total_amount: 1,
      currency: "EUR",
      appointment_address: "Plateau, Dakar",
    };
    const booking = await accounts.client.supabase.from("bookings").insert(bookingPayload).select("id,client_id,provider_id,total_amount,currency,starts_at,ends_at,appointment_address").single();
    assert.ifError(booking.error); created.bookingIds.push(booking.data.id);
    record(results, "Réservation persistée avec attribution et montant serveur", booking.data.provider_id === accounts.provider.id && booking.data.total_amount === 12500 && booking.data.currency === "XOF");
    const duplicate = await accounts.client.supabase.from("bookings").insert(bookingPayload).select("id");
    record(results, "Double réservation refusée", Boolean(duplicate.error));
    const clientView = await accounts.client.supabase.from("bookings").select("id,total_amount,starts_at,appointment_address").eq("id", booking.data.id).single();
    const providerView = await accounts.provider.supabase.from("bookings").select("id,total_amount,starts_at,appointment_address").eq("id", booking.data.id).single();
    assert.ifError(clientView.error); assert.ifError(providerView.error);
    record(results, "Même rendez-vous visible cliente et prestataire", clientView.data.id === providerView.data.id);
    const outsiderView = await accounts.outsider.supabase.from("bookings").select("id").eq("id", booking.data.id);
    assert.ifError(outsiderView.error);
    const outsiderUpdate = await accounts.outsider.supabase.from("bookings").update({ status: "confirmed" }).eq("id", booking.data.id).select("id");
    record(results, "RLS masque et protège la réservation des tiers", outsiderView.data.length === 0 && outsiderUpdate.data.length === 0);

    const conversation = await accounts.client.supabase.rpc("ensure_booking_conversation", { target_booking_id: booking.data.id });
    assert.ifError(conversation.error); created.conversationIds.push(conversation.data);
    const message = await accounts.client.supabase.from("messages").insert({ conversation_id: conversation.data, sender_id: accounts.client.id, body: "Message de recette finale" }).select("id").single();
    assert.ifError(message.error);
    const providerMessages = await accounts.provider.supabase.from("messages").select("id,body").eq("conversation_id", conversation.data);
    assert.ifError(providerMessages.error);
    const outsiderMessages = await accounts.outsider.supabase.from("messages").select("id").eq("conversation_id", conversation.data);
    assert.ifError(outsiderMessages.error);
    record(results, "Messagerie commune et privée", providerMessages.data.some((row) => row.id === message.data.id) && outsiderMessages.data.length === 0);

    const favorite = await accounts.client.supabase.from("favorites").insert({ client_id: accounts.client.id, provider_id: accounts.provider.id }).select("provider_id").single();
    assert.ifError(favorite.error);
    const foreignFavorite = await accounts.outsider.supabase.from("favorites").select("provider_id").eq("client_id", accounts.client.id);
    assert.ifError(foreignFavorite.error);
    record(results, "Favori persistant et privé", favorite.data.provider_id === accounts.provider.id && foreignFavorite.data.length === 0);

    const slug = `recette-${runId}`.toLowerCase();
    const category = await accounts.admin.supabase.rpc("admin_manage_category", {
      target_action: "create", target_category_id: null, target_name: "Catégorie Recette", target_slug: slug,
      target_description: "Catégorie temporaire de recette", target_icon: "sparkles", target_image_url: null,
      target_parent_id: null, target_sort_order: 9999, target_is_active: true,
    });
    assert.ifError(category.error); created.categoryIds.push(category.data);
    const publicCategory = await accounts.client.supabase.from("categories").select("id,name").eq("id", category.data).single();
    assert.ifError(publicCategory.error);
    record(results, "CRUD catégorie Admin visible côté cliente", publicCategory.data.name === "Catégorie Recette");

    const adminBooking = await accounts.admin.supabase.from("bookings").select("id").eq("id", booking.data.id).single();
    assert.ifError(adminBooking.error);
    const superAudit = await accounts.super_admin.supabase.from("audit_logs").select("id").limit(1);
    assert.ifError(superAudit.error);
    record(results, "Admin autorisé voit la réservation et Super Admin voit l'audit", adminBooking.data.id === booking.data.id && Array.isArray(superAudit.data));

    return {
      ok: true,
      runId,
      accountRoles: Object.keys(accounts).filter((key) => key !== "outsider"),
      previewUrl,
      checks: results,
      createdCounts: {
        accounts: Object.keys(accounts).length,
        bookings: created.bookingIds.length,
        services: created.serviceIds.length,
        businesses: created.businessIds.length,
        categories: created.categoryIds.length,
      },
    };
  } catch (error) {
    return { ok: false, runId, previewUrl, checks: results, failure: error instanceof Error ? error.message : String(error) };
  }
}

export function browserAccount(role) {
  assert.ok(state, "Aucune recette active");
  const account = state.accounts[role];
  assert.ok(account, `Rôle inconnu: ${role}`);
  return { email: account.email, password: account.password };
}

export async function browserLoginLink(role, returnTo = "/") {
  assert.ok(state, "Aucune recette active");
  const account = state.accounts[role];
  assert.ok(account, `Rôle inconnu: ${role}`);
  const callback = new URL("/auth/callback", state.previewUrl);
  callback.searchParams.set("returnTo", returnTo);
  const generated = await state.admin.auth.admin.generateLink({
    type: "magiclink",
    email: account.email,
    options: { redirectTo: callback.toString() },
  });
  assert.ifError(generated.error);
  assert.ok(generated.data.properties?.action_link, "Lien de connexion temporaire absent");
  return generated.data.properties.action_link;
}

export async function finishFinalAcceptance() {
  if (!state) return { cleaned: true, accounts: 0 };
  const { admin, accounts, created } = state;
  const ids = Object.values(accounts).map((account) => account.id);
  for (const account of Object.values(accounts)) await account.supabase.auth.signOut().catch(() => undefined);
  if (created.categoryIds.length) await admin.from("categories").delete().in("id", created.categoryIds);
  for (const id of ids.reverse()) await admin.auth.admin.deleteUser(id);
  const count = ids.length;
  state = null;
  return { cleaned: true, accounts: count };
}
