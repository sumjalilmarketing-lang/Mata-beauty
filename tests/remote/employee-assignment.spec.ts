import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { enrollQaMfa } from "./qa-mfa";

const url = process.env.REMOTE_SUPABASE_URL ?? "";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", options);
const password = `QA-${randomUUID()}!`, run = randomUUID();
const accounts: { id: string; email: string }[] = [];
let businessId = "", serviceId = "", employeeId = "";
const day = new Date(Date.now() + 4 * 86400000), date = day.toISOString().slice(0, 10);
const nextDay = new Date(day.getTime() + 86400000), nextDate = nextDay.toISOString().slice(0, 10);
const name = `Salon équipe ${run.slice(0, 8)}`;

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("navigation", { name: "Navigation de l’application" }).getByRole("button", { name: "Se connecter à MATA Beauty" }).click();
  await page.getByLabel("Adresse e-mail", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(u => u.pathname !== "/");
  await page.waitForLoadState("networkidle");
}

async function visit(page: Page, path: string) {
  await page.waitForLoadState("networkidle");
  const current = new URL(page.url()), destination = new URL(path, current);
  const link = page.locator(`a[href=${JSON.stringify(path)}]:visible`).first();
  if (current.pathname !== destination.pathname && await link.count()) {
    await Promise.all([
      page.waitForURL(u => u.href === destination.href),
      link.click(),
    ]);
  } else if (current.href === destination.href) {
    await page.reload();
  } else {
    await page.goto(path);
  }
  await page.waitForLoadState("networkidle");
}

test.beforeAll(async () => {
  test.setTimeout(120000);
  expect(url).toBe("https://kazlvtxkbsdhbfvtqqdp.supabase.co");
  for (const role of ["owner", "client", "reviewer"]) {
    const email = `codex-employee-ui-${role}-${run}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { qa_suppress_email: true }, user_metadata: { legal_accepted: true, professional_intent: role === "owner" } });
    expect(created.error).toBeNull(); accounts.push({ id: created.data.user!.id, email });
  }
  expect((await admin.from("provider_profiles").update({ business_name: name, slug: `team-${run}`, status: "approved", city: "Dakar", service_mode: "salon" }).eq("profile_id", accounts[0].id)).error).toBeNull();
  const reviewer = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY ?? "", options);
  const role = await admin.from("admin_roles").select("id").eq("key", "super_admin").single(); expect(role.error).toBeNull();
  expect((await admin.from("profiles").update({ role: "admin" }).eq("id", accounts[2].id)).error).toBeNull();
  expect((await admin.from("admin_user_roles").insert({ user_id: accounts[2].id, role_id: role.data!.id, assigned_by: accounts[2].id, requires_mfa: true, is_active: true })).error).toBeNull();
  expect((await reviewer.auth.signInWithPassword({ email: accounts[2].email, password })).error).toBeNull();
  await enrollQaMfa(reviewer);
  const business = await admin.from("businesses").insert({ owner_id: accounts[0].id, name, slug: `team-${run}`, business_type: "salon", address: "Adresse QA Dakar", city: "Dakar", status: "draft" }).select("id").single(); expect(business.error).toBeNull(); businessId = business.data!.id;
  expect((await reviewer.from("businesses").update({ status: "approved" }).eq("id", businessId)).error).toBeNull();
  const reference = await admin.from("services").select("id").eq("is_active", true).limit(1).single(); expect(reference.error).toBeNull();
  const service = await admin.from("provider_services").insert({ provider_id: accounts[0].id, business_id: businessId, service_id: reference.data!.id, title: "Tresses équipe QA", duration_minutes: 60, price_amount: 15000, currency: "XOF", is_active: true }).select("id").single(); expect(service.error).toBeNull(); serviceId = service.data!.id;
  await reviewer.auth.signOut();
});
test.afterAll(async () => {
  if (accounts[0]) expect((await admin.from("bookings").delete().eq("provider_id", accounts[0].id)).error).toBeNull();
  if (businessId) {
    const files = await admin.storage.from("business-media").list(businessId); const paths = (files.data ?? []).filter(f => f.id).map(f => `${businessId}/${f.name}`);
    if (paths.length) await admin.storage.from("business-media").remove(paths);
    expect((await admin.from("businesses").delete().eq("id", businessId)).error).toBeNull();
  }
  for (const account of accounts.reverse()) expect((await admin.auth.admin.deleteUser(account.id)).error).toBeNull();
});

test("équipe : réservations manuelle et automatique, notifications, historique et archivage", async ({ browser }) => {
  test.setTimeout(360000);
  const ownerContext = await browser.newContext(), clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const owner = await ownerContext.newPage(), client = await clientContext.newPage();
  const remote = process.env.REMOTE_APP_URL, bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (remote && bypass) for (const page of [owner, client]) await page.route(`${new URL(remote).origin}/**`, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }));
  const errors: string[] = []; owner.on("pageerror", error => errors.push(error.message)); client.on("pageerror", error => errors.push(error.message));
  try {
    await login(owner, accounts[0].email); await visit(owner, "/pro/team");
    await owner.getByRole("button", { name: "Ajouter un employé", exact: true }).click();
    await owner.getByLabel("Prénom", { exact: true }).fill("Ndeye"); await owner.getByLabel("Nom public", { exact: true }).fill("Ndiaye QA");
    await owner.getByLabel("Fonction", { exact: true }).fill("Coiffeuse"); await owner.getByLabel("Spécialités, séparées par des virgules").fill("Tresses, Nattes");
    await owner.getByLabel("Photo professionnelle").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=", "base64") });
    await owner.getByLabel("Tresses équipe QA", { exact: true }).check(); await owner.getByRole("button", { name: "Enregistrer la fiche", exact: true }).click();
    await expect(owner.getByRole("heading", { name: "Ndeye Ndiaye QA", exact: true })).toBeVisible();
    await expect(owner.getByRole("img", { name: "Photo de Ndeye Ndiaye QA" })).toBeVisible();
    await owner.getByRole("button", { name: "Horaires et absences", exact: true }).click();
    await owner.getByRole("combobox", { name: /^Jour/ }).selectOption(String(day.getUTCDay()));
    await owner.getByLabel("Début", { exact: true }).fill("08:00"); await owner.getByLabel("Fin", { exact: true }).fill("18:00");
    await owner.getByRole("button", { name: "Ajouter une plage", exact: true }).click();
    await expect(owner.getByText("Disponibilités enregistrées.", { exact: false })).toBeVisible();
    await owner.getByRole("button", { name: "Activer la réservation par équipe", exact: true }).click();
    await expect(owner.getByRole("button", { name: "Désactiver la réservation par équipe", exact: true })).toBeVisible();
    const member = await admin.from("collaborators").select("id,profile_id").eq("business_id", businessId).single(); expect(member.error).toBeNull(); employeeId = member.data!.id; expect(member.data!.profile_id).toBeNull();
    await owner.screenshot({ path: "work/employee-assignment/owner-team.png", fullPage: true });
    const ownerApi = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY ?? "", options);
    expect((await ownerApi.auth.signInWithPassword({ email: accounts[0].email, password })).error).toBeNull();
    const alternate = await ownerApi.rpc("save_team_member", { target_business_id: businessId, target_member_id: null, member: { first_name: "Awa", public_last_name: "QA", specialties: ["Tresses"] }, service_ids: [serviceId] }); expect(alternate.error).toBeNull();
    expect((await ownerApi.from("collaborator_hours").insert([
      { collaborator_id: alternate.data, weekday: day.getUTCDay(), starts_at: "08:00", ends_at: "18:00" },
      { collaborator_id: alternate.data, weekday: nextDay.getUTCDay(), starts_at: "08:00", ends_at: "18:00" },
    ])).error).toBeNull();
    await login(client, accounts[1].email); await visit(client, `/?service=${serviceId}`);
    await expect(client.getByRole("dialog")).toBeVisible();
    await client.getByLabel("Choisir une autre date").fill(date);
    await expect(client.getByText("Ndeye Ndiaye QA", { exact: true })).toBeVisible();
    await client.getByRole("radio", { name: /Ndeye Ndiaye QA/ }).check();
    await client.getByLabel("Choisir une autre date").fill(nextDate);
    await expect(client.getByRole("radio", { name: /Peu importe, attribuez-moi/ })).toBeChecked();
    await expect(client.getByRole("radio", { name: /Ndeye Ndiaye QA/ })).toHaveCount(0);
    await expect(client.getByRole("radio", { name: /Awa QA/ })).toBeVisible();
    await expect(client.locator(".premium-slot-grid").getByRole("button", { name: "10:00", exact: true })).toBeVisible();
    await expect(client.getByText("Aucun créneau publié ce jour.", { exact: false })).toHaveCount(0);
    await client.getByLabel("Choisir une autre date").fill(date);
    await client.getByRole("radio", { name: /Ndeye Ndiaye QA/ }).check();
    await client.locator(".premium-slot-grid").getByRole("button", { name: "10:00", exact: true }).click();
    await client.getByRole("button", { name: /^Confirmer ·/ }).click();
    await expect(client.getByText("Votre rendez-vous est créé", { exact: true })).toBeVisible();
    await expect(client.getByRole("definition").filter({ hasText: "Ndeye Ndiaye QA" })).toBeVisible();
    const booking = await admin.from("bookings").select("id,collaborator_id").eq("provider_id", accounts[0].id).single(); expect(booking.error).toBeNull(); expect(booking.data!.collaborator_id).toBe(employeeId);
    await client.screenshot({ path: "work/employee-assignment/client-assignment.png", fullPage: true });
    await visit(owner, "/pro/team");
    await owner.locator(".team-cards article").filter({ has: owner.getByRole("heading", { name: "Ndeye Ndiaye QA", exact: true }) }).getByRole("button", { name: "Horaires et absences", exact: true }).click();
    await owner.getByLabel("Du", { exact: true }).fill(`${date}T09:00`); await owner.getByLabel("Au", { exact: true }).fill(`${date}T12:00`);
    await owner.getByRole("button", { name: "Enregistrer l’exception", exact: true }).click();
    await expect(owner.getByText("Indisponibilité : réaffectation à prévoir.", { exact: false })).toBeVisible();
    await owner.getByRole("button", { name: "Réaffecter", exact: true }).click();
    await owner.getByRole("combobox", { name: /^Collaborateur disponible/ }).selectOption(alternate.data as string);
    await owner.locator('input[name="reason"]').last().fill("Congé de Ndeye");
    owner.once("dialog", dialog => void dialog.accept());
    await owner.getByRole("button", { name: "Confirmer la réaffectation", exact: true }).click();
    await expect(owner.getByText("Réaffectation enregistrée.", { exact: false })).toBeVisible();
    await visit(owner, "/pro/bookings"); const appointment = owner.locator(".live-appointment").filter({ hasText: "Tresses équipe QA" });
    await expect(appointment).toContainText("Awa QA");
    await appointment.getByRole("button", { name: "Accepter", exact: true }).click();
    await appointment.getByRole("button", { name: "Démarrer", exact: true }).click();
    await appointment.getByRole("button", { name: "Terminer", exact: true }).click();
    await expect(appointment).toContainText("Terminé");
    await visit(owner, "/pro/team");
    const completedAppointment = owner.locator(`#booking-${booking.data!.id}`);
    await expect(completedAppointment).toContainText("Terminé");
    await expect(completedAppointment.getByRole("button", { name: "Réaffecter", exact: true })).toHaveCount(0);
    await completedAppointment.getByRole("button", { name: "Voir l’historique", exact: true }).click();
    const history = owner.getByRole("region", { name: "Historique du rendez-vous" });
    await expect(history).toContainText("Ndeye Ndiaye QA");
    await expect(history).toContainText("Affectation initiale");
    await expect(history).toContainText("Awa QA");
    await expect(history).toContainText("Congé de Ndeye");
    await expect(history.getByRole("combobox", { name: /^Collaborateur disponible/ })).toHaveCount(0);
    await expect(history.getByRole("button", { name: "Confirmer la réaffectation", exact: true })).toHaveCount(0);
    await history.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(history).toHaveCount(0);
    await visit(client, "/app/bookings"); await client.getByText("Donner mon avis sur cette prestation", { exact: true }).click();
    await client.getByLabel("Votre expérience", { exact: true }).fill("Très bonne prestation avec Awa.");
    await client.getByRole("button", { name: "Publier mon avis", exact: true }).click();
    await expect(client.getByText("Avis enregistré · Réservation vérifiée", { exact: true })).toBeVisible();
    const review = await admin.from("reviews").select("collaborator_id").eq("booking_id", booking.data!.id).single(); expect(review.error).toBeNull(); expect(review.data!.collaborator_id).toBe(alternate.data);

    await visit(client, `/?service=${serviceId}`);
    await expect(client.getByRole("dialog")).toBeVisible();
    await client.getByLabel("Choisir une autre date").fill(nextDate);
    await expect(client.getByRole("radio", { name: /Peu importe, attribuez-moi/ })).toBeChecked();
    await expect(client.getByRole("radio", { name: /Awa QA/ })).toBeVisible();
    await client.locator(".premium-slot-grid").getByRole("button", { name: "10:00", exact: true }).click();
    await expect(client.getByText("Professionnel : Affectation automatique à une personne qualifiée et disponible", { exact: true })).toBeVisible();
    await client.getByRole("button", { name: /^Confirmer ·/ }).click();
    await expect(client.getByText("Votre rendez-vous est créé", { exact: true })).toBeVisible();
    await expect(client.getByRole("definition").filter({ hasText: "Awa QA" })).toBeVisible();
    const automaticBooking = await admin.from("bookings").select("id,collaborator_id,collaborator_name,status").eq("provider_id", accounts[0].id).eq("starts_at", `${nextDate}T10:00:00Z`).single();
    expect(automaticBooking.error).toBeNull();
    expect(automaticBooking.data).toMatchObject({ collaborator_id: alternate.data, collaborator_name: "Awa QA", status: "pending" });
    await client.getByRole("button", { name: "Terminer", exact: true }).click();

    const assignmentNotice = await admin.from("notifications").select("id,title,body,data,read_at").eq("profile_id", accounts[1].id).eq("kind", "booking_assignment").contains("data", { booking_id: automaticBooking.data!.id }).single();
    expect(assignmentNotice.error).toBeNull();
    expect(assignmentNotice.data!.read_at).toBeNull();
    expect(assignmentNotice.data!.data.href).toBe(`/app/bookings#booking-${automaticBooking.data!.id}`);
    await visit(client, "/app/notifications");
    const notificationCard = client.locator(".notification-card").filter({ hasText: assignmentNotice.data!.body });
    await expect(notificationCard).toHaveCount(1);
    await expect(notificationCard.getByText("Non lue", { exact: true })).toBeVisible();
    await notificationCard.getByRole("button", { name: "Ouvrir", exact: true }).click();
    await client.waitForURL(u => u.pathname === "/app/bookings" && u.hash === `#booking-${automaticBooking.data!.id}`);
    await expect(client.locator(`#booking-${automaticBooking.data!.id}`)).toContainText("Awa QA");
    const readNotice = await admin.from("notifications").select("read_at").eq("id", assignmentNotice.data!.id).single();
    expect(readNotice.error).toBeNull(); expect(readNotice.data!.read_at).not.toBeNull();
    await visit(client, "/app/notifications");
    await expect(notificationCard).toHaveClass(/\bread\b/);
    await expect(notificationCard.getByText("Non lue", { exact: true })).toHaveCount(0);

    const publicApi = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY ?? "", options);
    const publicBefore = await publicApi.rpc("get_booking_team_availability", { target_service_id: serviceId, from_date: nextDate });
    expect(publicBefore.error).toBeNull();
    expect(publicBefore.data.slots).toEqual(expect.arrayContaining([expect.objectContaining({ collaborator_id: alternate.data })]));
    await visit(owner, "/pro/team");
    const alternateCard = owner.locator(".team-management > .team-cards > article").filter({ has: owner.getByRole("heading", { name: "Awa QA", exact: true }) });
    await alternateCard.getByRole("button", { name: "Désactiver", exact: true }).click();
    await expect(alternateCard.getByText("Inactif", { exact: true })).toBeVisible();
    const inactiveMember = await admin.from("collaborators").select("is_active,archived_at").eq("id", alternate.data as string).single();
    expect(inactiveMember.error).toBeNull(); expect(inactiveMember.data).toEqual({ is_active: false, archived_at: null });
    const publicInactive = await publicApi.rpc("get_booking_team_availability", { target_service_id: serviceId, from_date: nextDate });
    expect(publicInactive.error).toBeNull(); expect(publicInactive.data.slots).toEqual([]);
    await alternateCard.getByRole("button", { name: "Réactiver", exact: true }).click();
    await expect(alternateCard.getByRole("button", { name: "Désactiver", exact: true })).toBeVisible();
    const activeMember = await admin.from("collaborators").select("is_active,archived_at").eq("id", alternate.data as string).single();
    expect(activeMember.error).toBeNull(); expect(activeMember.data).toEqual({ is_active: true, archived_at: null });
    const publicReactivated = await publicApi.rpc("get_booking_team_availability", { target_service_id: serviceId, from_date: nextDate });
    expect(publicReactivated.error).toBeNull();
    expect(publicReactivated.data.slots).toEqual(expect.arrayContaining([expect.objectContaining({ collaborator_id: alternate.data })]));

    const recordedHistory = await admin.from("booking_assignments").select("id,booking_id,collaborator_id,collaborator_name,reason").in("booking_id", [booking.data!.id, automaticBooking.data!.id]).order("id");
    expect(recordedHistory.error).toBeNull(); expect(recordedHistory.data).toHaveLength(3);
    const recordedBookings = await admin.from("bookings").select("id,collaborator_id,collaborator_name,status").eq("provider_id", accounts[0].id).order("id");
    expect(recordedBookings.error).toBeNull(); expect(recordedBookings.data).toHaveLength(2);
    const archivePrompt = owner.waitForEvent("dialog");
    const archiveClick = alternateCard.getByRole("button", { name: "Archiver", exact: true }).click();
    const dialog = await archivePrompt;
    expect(dialog.type()).toBe("confirm"); expect(dialog.message()).toContain("Archiver Awa QA");
    expect(dialog.message()).toContain("Son historique est conservé");
    await dialog.accept(); await archiveClick;
    await expect(alternateCard.getByText("Archivé", { exact: true })).toBeVisible();
    await expect(alternateCard.getByRole("button", { name: "Réactiver", exact: true })).toHaveCount(0);
    const archivedMember = await admin.from("collaborators").select("is_active,is_bookable,archived_at").eq("id", alternate.data as string).single();
    expect(archivedMember.error).toBeNull();
    expect(archivedMember.data).toMatchObject({ is_active: false, is_bookable: false }); expect(archivedMember.data!.archived_at).not.toBeNull();
    const publicArchived = await publicApi.rpc("get_booking_team_availability", { target_service_id: serviceId, from_date: nextDate });
    expect(publicArchived.error).toBeNull(); expect(publicArchived.data.slots).toEqual([]);
    const retainedHistory = await admin.from("booking_assignments").select("id,booking_id,collaborator_id,collaborator_name,reason").in("booking_id", [booking.data!.id, automaticBooking.data!.id]).order("id");
    const retainedBookings = await admin.from("bookings").select("id,collaborator_id,collaborator_name,status").eq("provider_id", accounts[0].id).order("id");
    const retainedReview = await admin.from("reviews").select("collaborator_id").eq("booking_id", booking.data!.id).single();
    expect(retainedHistory.error).toBeNull(); expect(retainedHistory.data).toEqual(recordedHistory.data);
    expect(retainedBookings.error).toBeNull(); expect(retainedBookings.data).toEqual(recordedBookings.data);
    expect(retainedReview.error).toBeNull(); expect(retainedReview.data).toEqual(review.data);
    await expect(owner.locator(`#booking-${automaticBooking.data!.id}`).getByRole("alert")).toContainText("réaffectation à prévoir");
    await owner.locator(`#booking-${booking.data!.id}`).getByRole("button", { name: "Voir l’historique", exact: true }).click();
    await expect(history).toContainText("Ndeye Ndiaye QA"); await expect(history).toContainText("Awa QA");
    await expect(history).toContainText("Congé de Ndeye");
    await visit(client, `/?service=${serviceId}`);
    await client.getByLabel("Choisir une autre date").fill(nextDate);
    await expect(client.getByText("Aucun créneau publié ce jour.", { exact: false })).toBeVisible();
    await expect(client.getByRole("radio", { name: /Awa QA/ })).toHaveCount(0);
    await ownerApi.auth.signOut();
    expect(errors).toEqual([]);
  } finally { await ownerContext.close(); await clientContext.close(); }
});
