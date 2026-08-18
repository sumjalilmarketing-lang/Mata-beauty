import { randomUUID } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url=process.env.REMOTE_SUPABASE_URL??"";
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY??"";
const anonKey=process.env.REMOTE_SUPABASE_ANON_KEY??"";
const remoteAppUrl=process.env.REMOTE_APP_URL??"";
const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const run=`${Date.now()}-${randomUUID().slice(0,6)}`;
const password=`Mata-Admin-UI-${randomUUID()}!`;
const accounts=new Map<string,{id:string;email:string}>();
let admin:SupabaseClient;
let businessId="";

async function openGroup(nav:Locator,name:string){
  const trigger=nav.getByRole("button",{name,exact:true});
  await expect(trigger).toBeVisible();
  if(await trigger.getAttribute("aria-expanded")!=="true")await trigger.click();
}

async function provision(label:string,role:"client"|"provider"|"support"|"verification_agent"|"moderator"|"finance"|"admin"|"super_admin"){
  const email=`codex-admin-ui-${label}-${run}@example.test`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Admin UI ${label}`,legal_accepted:"true",professional_intent:role==="provider"?"true":"false"}});
  expect(created.error).toBeNull();
  const id=created.data.user!.id;
  accounts.set(label,{id,email});
  if(role==="provider"){
    expect((await admin.from("profiles").update({role:"provider"}).eq("id",id)).error).toBeNull();
    expect((await admin.from("provider_profiles").update({business_name:`UI Provider ${label} ${run}`,slug:`ui-provider-${label}-${run}`.toLowerCase(),status:"pending_review",city:"Dakar"}).eq("profile_id",id)).error).toBeNull();
  }
  if(["support","verification_agent","moderator","finance","admin","super_admin"].includes(role)){
    const roleRow=await admin.from("admin_roles").select("id").eq("key",role).single();
    expect(roleRow.error).toBeNull();
    expect((await admin.from("profiles").update({role:"admin",is_suspended:false}).eq("id",id)).error).toBeNull();
    expect((await admin.from("admin_user_roles").insert({user_id:id,role_id:roleRow.data!.id,assigned_by:id,requires_mfa:role==="super_admin",is_active:true})).error).toBeNull();
  }
}

async function signIntoApplication(page:import("@playwright/test").Page,label:string,route:string){
  if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,request=>request.continue({headers:{...request.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
  await page.goto(remoteAppUrl);
  await page.getByRole("navigation",{name:"Navigation de l’application"}).getByRole("button",{name:/Profil/}).click();
  await page.getByLabel("Adresse e-mail").fill(accounts.get(label)!.email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button",{name:"Se connecter",exact:true}).click();
  await page.waitForURL(url=>url.pathname!=="/",{timeout:25000});
  await page.goto(`${remoteAppUrl}${route}`);
}

test.describe.serial("contrôle d’accès admin distant",()=>{
  test.beforeAll(async()=>{
    admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    await provision("client","client");
    await provision("provider","provider");
    await provision("salon","provider");
    await provision("staff","client");
    await provision("support","support");
    await provision("onboarding","verification_agent");
    await provision("moderator","moderator");
    await provision("finance","finance");
    await provision("admin","admin");
    await provision("super","super_admin");
    const business=await admin.from("businesses").insert({owner_id:accounts.get("salon")!.id,name:`Salon navigation ${run}`,slug:`salon-navigation-${run}`.toLowerCase(),address:"Dakar",city:"Dakar",status:"approved"}).select("id").single();
    expect(business.error).toBeNull();businessId=business.data!.id;
    expect((await admin.from("collaborators").insert({business_id:businessId,profile_id:accounts.get("staff")!.id,display_name:"Employé navigation",internal_role:"member",is_active:true,is_bookable:true})).error).toBeNull();
    const staffApi=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    expect((await staffApi.auth.signInWithPassword({email:accounts.get("staff")!.email,password})).error).toBeNull();
    const membership=await staffApi.from("collaborators").select("id",{count:"exact",head:true}).eq("profile_id",accounts.get("staff")!.id).eq("is_active",true);
    expect(membership.error).toBeNull();expect(membership.count).toBe(1);
    await staffApi.auth.signOut();
  });

  test.afterAll(async()=>{if(businessId)await admin.from("businesses").delete().eq("id",businessId);for(const account of [...accounts.values()].reverse())await admin.auth.admin.deleteUser(account.id);});

  for(const [label,route,groups] of [
    ["client","/app",["Découvrir","Mes rendez-vous","Mes inspirations","Communication","Paiements","Support","Mon profil","Paramètres"]],
    ["provider","/pro",["Activité","Relations","Offre","Contenu","Finance","Support","Profil professionnel","Paramètres"]],
    ["salon","/salon",["Activité","Équipe","Offre","Contenu","Relations","Finance","Profil du salon","Support","Paramètres"]],
    ["staff","/staff",["Activité","Relations","Performance","Profil","Paramètres"]],
  ] as const){
    test(`la navigation ${label} ouvre chaque groupe et conserve ses routes`,async({page})=>{
      await signIntoApplication(page,label,route);
      const nav=page.getByRole("navigation",{name:/Navigation/}).first();
      for(const group of groups){
        const trigger=nav.getByRole("button",{name:group,exact:true});
        await expect(trigger).toBeVisible();await trigger.click();await expect(trigger).toHaveAttribute("aria-expanded","true");
        const regionId=await trigger.getAttribute("aria-controls");
        const links=page.locator(`#${regionId} a`);expect(await links.count()).toBeGreaterThan(0);
        for(const link of await links.all())expect(await link.getAttribute("href")).toMatch(new RegExp(`^${route.replace("/app","/app").replace("/pro","/pro").replace("/salon","/salon").replace("/staff","/staff")}`));
        await trigger.click();await expect(trigger).toHaveAttribute("aria-expanded","false");
      }
    });
  }

  test("le menu workspace reste accessible sur les sept largeurs de recette",async({page})=>{
    await signIntoApplication(page,"client","/app");
    for(const width of [320,375,390,430,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}px sans débordement`).toBe(true);
      if(width<=768){
        const mobile=page.getByRole("navigation",{name:"Navigation mobile"});await expect(mobile).toBeVisible();expect(await mobile.locator("a,button").count()).toBeLessThanOrEqual(5);
        await mobile.getByRole("button",{name:"Ouvrir toutes les rubriques"}).click();await expect(page.locator(".workspace-sidebar")).toBeVisible();
        await page.getByRole("button",{name:"Fermer la navigation"}).click();
      }else{
        await expect(page.locator(".workspace-sidebar")).toBeVisible();await expect(page.getByRole("navigation",{name:"Navigation mobile"})).toBeHidden();
      }
    }
  });

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
    for(const group of ["Utilisateurs","Marketplace","Contenu","Relation client"])await expect(nav.getByRole("button",{name:group,exact:true})).toBeVisible();
    for(const group of ["Onboarding","Finance","Communication","Sécurité","Plateforme","Paramètres"])await expect(nav.getByRole("button",{name:group,exact:true})).toHaveCount(0);
    await openGroup(nav,"Marketplace");for(const name of ["Réservations","Disponibilités"])await expect(nav.getByRole("button",{name,exact:true})).toBeVisible();
    await openGroup(nav,"Relation client");for(const name of ["Tickets","Réclamations","Litiges","Base de connaissances"])await expect(nav.getByRole("button",{name,exact:true})).toBeVisible();
    await openGroup(nav,"Utilisateurs");await nav.getByRole("button",{name:"Clients",exact:true}).click();
    await expect(page.getByRole("button",{name:"Suspendre"})).toHaveCount(0);
  });

  test("l’agent onboarding voit les dossiers et décisions prestataires uniquement",async({page})=>{
    if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("onboarding")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Vérifications",level:1})).toBeVisible({timeout:20000});
    await expect(page.getByText("Agent onboarding")).toBeVisible();
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    for(const group of ["Utilisateurs","Onboarding"])await expect(nav.getByRole("button",{name:group,exact:true})).toBeVisible();
    for(const group of ["Marketplace","Contenu","Relation client","Finance","Sécurité"])await expect(nav.getByRole("button",{name:group,exact:true})).toHaveCount(0);
    await openGroup(nav,"Onboarding");for(const name of ["Dossiers","Professionnels en attente","Documents","KYC","Validations","Refus"])await expect(nav.getByRole("button",{name,exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Approuver"}).first()).toBeVisible();
  });

  test("la finance voit uniquement réservations et modules financiers audités",async({page})=>{
    if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("finance")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Paiements",level:1})).toBeVisible({timeout:20000});
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    for(const group of ["Marketplace","Finance","Sécurité","Plateforme"])await expect(nav.getByRole("button",{name:group,exact:true})).toBeVisible();
    for(const group of ["Utilisateurs","Contenu","Relation client","Onboarding","Communication","Paramètres"])await expect(nav.getByRole("button",{name:group,exact:true})).toHaveCount(0);
    await openGroup(nav,"Finance");for(const name of ["Transactions","Paiements","Commissions","Wallets","Versements","Remboursements","Rapprochement"])await expect(nav.getByRole("button",{name,exact:true})).toBeVisible();
    await openGroup(nav,"Sécurité");await expect(nav.getByRole("button",{name:"Audit",exact:true})).toBeVisible();
  });

  test("le modérateur ne voit que les fonctions de confiance autorisées",async({page})=>{
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("moderator")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Signalements",level:1})).toBeVisible({timeout:20000});
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    for(const group of ["Utilisateurs","Marketplace","Contenu","Relation client"])await expect(nav.getByRole("button",{name:group,exact:true})).toBeVisible();
    for(const group of ["Onboarding","Finance","Communication","Sécurité","Plateforme","Paramètres"])await expect(nav.getByRole("button",{name:group,exact:true})).toHaveCount(0);
  });

  test("l’administrateur opérationnel reste séparé des fonctions super admin",async({page})=>{
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("admin")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Vue d’ensemble",level:1})).toBeVisible({timeout:20000});
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    await expect(nav.getByRole("button",{name:"Sécurité",exact:true})).toHaveCount(0);
    await expect(nav.getByRole("button",{name:"Paramètres",exact:true})).toHaveCount(0);
    await expect(nav.getByRole("button",{name:"Utilisateurs",exact:true})).toBeVisible();
  });

  test("le super administrateur voit tout et sa connexion est journalisée",async({page})=>{
    if(bypass)await page.route(`${new URL(remoteAppUrl).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
    await page.goto(`${remoteAppUrl}/admin`);await page.getByLabel("Adresse administrateur").fill(accounts.get("super")!.email);await page.getByLabel("Mot de passe").fill(password);await page.getByRole("button",{name:"Accéder à l’administration"}).click();
    await expect(page.getByRole("heading",{name:"Vue d’ensemble",level:1})).toBeVisible({timeout:20000});
    const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});
    for(const group of ["Dashboard","Utilisateurs","Marketplace","Contenu","Relation client","Onboarding","Finance","Communication","Sécurité","Plateforme","Rapports","Paramètres"])await expect(nav.getByRole("button",{name:group,exact:true})).toBeVisible();
    await openGroup(nav,"Utilisateurs");for(const name of ["Clients","Professionnels","Salons","Employés","Agents internes","Administrateurs","Rôles","Permissions","Comptes suspendus","Sessions"])await expect(nav.getByRole("button",{name,exact:true})).toBeVisible();
    await openGroup(nav,"Plateforme");for(const name of ["Santé des services","Intégrations","Webhooks","Jobs","Paramètres fonctionnels","Fonctionnalités","Journaux techniques"])await expect(nav.getByRole("button",{name,exact:true})).toBeVisible();
    const sessions=await admin.from("admin_sessions").select("id").eq("user_id",accounts.get("super")!.id).is("revoked_at",null);
    expect(sessions.error).toBeNull();expect(sessions.data!.length).toBeGreaterThan(0);
    const logs=await admin.from("audit_logs").select("id").eq("actor_id",accounts.get("super")!.id).eq("action","admin.signed_in");
    expect(logs.error).toBeNull();expect(logs.data!.length).toBeGreaterThan(0);
  });
});
