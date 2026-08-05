import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url=process.env.REMOTE_SUPABASE_URL??"";
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY??"";
const remoteAppUrl=process.env.REMOTE_APP_URL??"";
const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const run=`${Date.now()}-${randomUUID().slice(0,6)}`;
const password=`Mata-Admin-UI-${randomUUID()}!`;
const accounts=new Map<string,{id:string;email:string}>();
let admin:SupabaseClient;

async function provision(label:string,role:"client"|"provider"|"support"|"verification_agent"|"finance"|"super_admin"){
  const email=`codex-admin-ui-${label}-${run}@example.test`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Admin UI ${label}`,legal_accepted:"true"}});
  expect(created.error).toBeNull();
  const id=created.data.user!.id;
  accounts.set(label,{id,email});
  if(role==="provider"){
    expect((await admin.from("profiles").update({role:"provider"}).eq("id",id)).error).toBeNull();
    expect((await admin.from("provider_profiles").insert({profile_id:id,business_name:`UI Provider ${run}`,slug:`ui-provider-${run}`.toLowerCase(),status:"pending_review",city:"Dakar"})).error).toBeNull();
  }
  if(["support","verification_agent","finance","super_admin"].includes(role)){
    const roleRow=await admin.from("admin_roles").select("id").eq("key",role).single();
    expect(roleRow.error).toBeNull();
    expect((await admin.from("profiles").update({role:"admin",is_suspended:false}).eq("id",id)).error).toBeNull();
    expect((await admin.from("admin_user_roles").insert({user_id:id,role_id:roleRow.data!.id,assigned_by:id,requires_mfa:role==="super_admin",is_active:true})).error).toBeNull();
  }
}

test.describe.serial("contrôle d’accès admin distant",()=>{
  test.beforeAll(async()=>{
    admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    await provision("client","client");
    await provision("provider","provider");
    await provision("support","support");
    await provision("onboarding","verification_agent");
    await provision("finance","finance");
    await provision("super","super_admin");
  });

  test.afterAll(async()=>{for(const account of [...accounts.values()].reverse())await admin.auth.admin.deleteUser(account.id);});

  for(const label of ["client","provider"]){
    test(`${label} est refusé sans chargement du centre de contrôle`,async({page})=>{
      if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
      await page.goto(`${remoteAppUrl}/admin`);
      await page.getByLabel("Adresse administrateur").fill(accounts.get(label)!.email);
      await page.getByLabel("Mot de passe").fill(password);
      await page.getByRole("button",{name:"Accéder à l’administration"}).click();
      await expect(page.getByRole("heading",{name:"Compte non autorisé"})).toBeVisible({timeout:20000});
      await expect(page.getByRole("navigation",{name:"Navigation Super Admin"})).toHaveCount(0);
    });
  }

  test("le support ne voit que utilisateurs, réservations, signalements et support",async({page})=>{
    if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("support")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Support",level:1})).toBeVisible({timeout:20000});
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    for(const name of ["Utilisateurs","Réservations","Calendrier","Signalements","Litiges","Support"])await expect(nav.getByRole("button",{name})).toBeVisible();
    for(const name of ["Prestataires","Paiements","Journaux d’audit","Administrateurs"])await expect(nav.getByRole("button",{name})).toHaveCount(0);
    await nav.getByRole("button",{name:"Utilisateurs"}).click();
    await expect(page.getByRole("button",{name:"Suspendre"})).toHaveCount(0);
  });

  test("l’agent onboarding voit les dossiers et décisions prestataires uniquement",async({page})=>{
    if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("onboarding")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Vérifications",level:1})).toBeVisible({timeout:20000});
    await expect(page.getByText("Agent onboarding")).toBeVisible();
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    for(const name of ["Utilisateurs","Prestataires","Salons","Vérifications"])await expect(nav.getByRole("button",{name})).toBeVisible();
    for(const name of ["Réservations","Paiements","Support","Journaux d’audit"])await expect(nav.getByRole("button",{name})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Approuver"}).first()).toBeVisible();
  });

  test("la finance voit uniquement réservations et modules financiers audités",async({page})=>{
    if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("finance")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Paiements",level:1})).toBeVisible({timeout:20000});
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    for(const name of ["Réservations","Calendrier","Paiements","Commissions","Reversements","Journaux d’audit"])await expect(nav.getByRole("button",{name})).toBeVisible();
    for(const name of ["Utilisateurs","Prestataires","Support","Administrateurs"])await expect(nav.getByRole("button",{name})).toHaveCount(0);
  });

  test("le super administrateur voit tout et sa connexion est journalisée",async({page})=>{
    if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("super")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Vue d’ensemble",level:1})).toBeVisible({timeout:20000});
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    for(const name of ["Utilisateurs","Prestataires","Paiements","Administrateurs","Rôles et permissions","Journaux d’audit","Sécurité"])await expect(nav.getByRole("button",{name})).toBeVisible();
    const sessions=await admin.from("admin_sessions").select("id").eq("user_id",accounts.get("super")!.id).is("revoked_at",null);
    expect(sessions.error).toBeNull();expect(sessions.data!.length).toBeGreaterThan(0);
    const logs=await admin.from("audit_logs").select("id").eq("actor_id",accounts.get("super")!.id).eq("action","admin.signed_in");
    expect(logs.error).toBeNull();expect(logs.data!.length).toBeGreaterThan(0);
  });
});
