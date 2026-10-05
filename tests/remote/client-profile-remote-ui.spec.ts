import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url=process.env.REMOTE_SUPABASE_URL??"", serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY??"", remoteAppUrl=process.env.REMOTE_APP_URL, bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const run=`${Date.now()}-${randomUUID().slice(0,6)}`, email=`codex-profile-ui-${run}@example.test`, password=`Mata-Profile-${randomUUID()}!`;
let admin:SupabaseClient,userId="";

test.beforeAll(async()=>{admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:"Mata Profil UI",legal_accepted:"true"}});expect(made.error).toBeNull();userId=made.data.user!.id;});
test.afterAll(async()=>{
  if (!userId) return;
  expect((await admin.from("support_tickets").delete().eq("requester_id", userId)).error).toBeNull();
  expect((await admin.from("account_deletion_requests").delete().eq("profile_id", userId)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  const remaining = await admin.from("profiles").select("id").eq("id", userId);
  expect(remaining.error).toBeNull(); expect(remaining.data).toHaveLength(0);
});

test("le profil personnel gère réellement identité préférences support et confidentialité",async({page})=>{
  test.setTimeout(120_000);
  if(remoteAppUrl&&bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
  await page.goto("/");
  await page.getByRole("navigation",{name:"Navigation de l’application"}).getByRole("button",{name:"Profil"}).click();
  await page.getByLabel("Adresse e-mail").fill(email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Se connecter",exact:true}).click();
  await page.getByRole("navigation",{name:"Navigation Espace client"}).getByRole("link",{name:"Profil",exact:true}).click();
  await expect(page.getByRole("region", { name: "Mon profil client" })).toBeVisible();
  await expect(page.locator("#edit-client-profile")).toHaveCount(0);
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("link", { name: "Mes favoris", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("link", { name: "Modifier mon profil", exact: true }).click();
  await expect(page.getByRole("heading",{name:"Identité"})).toBeVisible({timeout:20000});
  const identity=page.locator("#edit-client-profile");
  await identity.getByLabel("Prénom").fill("Aminata");await identity.getByLabel("Nom",{exact:true}).fill("Fall");await identity.getByLabel("Nom d’utilisateur").fill(`aminata_${run.replaceAll('-','_')}`.slice(0,30));await identity.getByLabel("Téléphone").fill("+221770000001");await identity.getByLabel("Ville").fill("Dakar");await identity.getByLabel("Quartier").fill("Mermoz");await identity.getByLabel("Bio").fill("Passionnée de coiffures protectrices.");await identity.getByRole("button",{name:"Enregistrer"}).click();
  await expect(page.getByText("Profil mis à jour.")).toBeVisible();
  const preferences=page.locator("#beauty-preferences");await preferences.getByLabel("Catégories favorites").fill("Tresses, Locks");await preferences.getByLabel("Budget minimum").fill("10000");await preferences.getByLabel("Budget maximum").fill("30000");await preferences.getByRole("button",{name:"Enregistrer"}).click();await expect(page.getByText("Préférences enregistrées.")).toBeVisible();
  await page.getByRole("navigation", { name: "Paramètres et confidentialité" }).getByRole("link", { name: "Aide", exact: true }).click();
  const support=page.locator("#client-support");await support.getByPlaceholder("Décrivez brièvement votre demande").fill(`Question profil ${run}`);await support.getByRole("button",{name:"Envoyer"}).click();await expect(page.getByText("Demande envoyée au support.")).toBeVisible();
  await page.getByRole("navigation", { name: "Paramètres et confidentialité" }).getByRole("link", { name: "Compte et confidentialité", exact: true }).click();
  const privacy=page.locator("#privacy-settings");await privacy.getByLabel("Afficher mes collections").check();await privacy.getByRole("button",{name:"Enregistrer"}).click();await expect(page.getByText("Confidentialité enregistrée.")).toBeVisible();
  page.on("dialog",async dialog=>{if(dialog.type()==="confirm")await dialog.accept();else await dialog.accept("Test UI Preview");});await privacy.getByRole("button",{name:"Demander la suppression du compte"}).click();await expect(page.getByText(/Demande enregistrée/)).toBeVisible();
  const [profile,prefs,settings,tickets,deletion]=await Promise.all([admin.from("profiles").select("username,bio").eq("id",userId).single(),admin.from("profile_preferences").select("budget_min,budget_max").eq("profile_id",userId).single(),admin.from("profile_privacy_settings").select("show_collections").eq("profile_id",userId).single(),admin.from("support_tickets").select("id").eq("requester_id",userId),admin.from("account_deletion_requests").select("status").eq("profile_id",userId).single()]);
  expect(profile.data?.bio).toContain("coiffures");expect(prefs.data).toMatchObject({budget_min:10000,budget_max:30000});expect(settings.data?.show_collections).toBe(true);expect(tickets.data).toHaveLength(1);expect(deletion.data?.status).toBe("requested");
});
