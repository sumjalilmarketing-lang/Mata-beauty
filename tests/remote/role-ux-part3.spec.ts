import { randomUUID } from "node:crypto";
import { checkWheel } from "./scroll-acceptance";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url=process.env.REMOTE_SUPABASE_URL??"";
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY??"",{auth:{persistSession:false}});
const password=`QA-${randomUUID()}!`,run=randomUUID();
const roles=["client","provider","verification_agent","support","moderator","admin","super_admin"];
const accounts=new Map<string,{id:string;email:string}>();
test.use({trace:'off',video:'off',screenshot:'off'});
async function login(page:Page,role:string) {
  const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET,base=process.env.REMOTE_APP_URL;
  if(bypass&&base) await page.route(`${new URL(base).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
  await page.goto("/");
  await page.getByRole("navigation",{name:"Navigation de l’application"}).getByRole("button",{name:"Profil"}).click();
  await page.getByLabel("Adresse e-mail").fill(accounts.get(role)!.email);await page.getByLabel("Mot de passe",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Se connecter",exact:true}).click();await expect(page).toHaveURL(/\/app/,{timeout:30000});
}
test.beforeAll(async()=>{
  const productionAllowed=process.env.ALLOW_PRODUCTION_QA==="mata-beauty.com"&&process.env.REMOTE_APP_URL==="https://mata-beauty.com"&&url==="https://qjdwxdbvrxedyfolnpol.supabase.co";
  if(url!=="https://kazlvtxkbsdhbfvtqqdp.supabase.co"&&!productionAllowed) throw new Error("Explicit production acceptance authorization required");
  for(const role of roles) {
    const email=`codex-ux-${role}-${run}@example.test`;
    const result=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{display_name:`Recette ${role}`,legal_accepted:true}});
    expect(result.error).toBeNull();const id=result.data.user!.id;accounts.set(role,{id,email});
    await admin.from("welcome_email_deliveries").update({status:"needs_review"}).eq("user_id",id);
    if(role==="provider") {
      expect((await admin.from("provider_profiles").insert({profile_id:id,business_name:`UX Pro ${run}`,slug:`ux-pro-${run}`,status:"draft",city:"Dakar"})).error).toBeNull();
      expect((await admin.from("provider_profiles").update({status:"approved"}).eq("profile_id",id)).error).toBeNull();
    }
    if(!["client","provider"].includes(role)) {
      const r=await admin.from("admin_roles").select("id").eq("key",role).single();expect(r.error).toBeNull();
      expect((await admin.from("profiles").update({role:"admin"}).eq("id",id)).error).toBeNull();
      expect((await admin.from("admin_user_roles").insert({user_id:id,role_id:r.data!.id,assigned_by:id,is_active:true,requires_mfa:false})).error).toBeNull();
    }
  }
});
test.afterAll(async()=>{ for(const account of accounts.values()) expect((await admin.auth.admin.deleteUser(account.id)).error).toBeNull(); });
test("visiteur : navigation et écran mobile",async({page})=>{
  const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET,base=process.env.REMOTE_APP_URL;
  if(bypass&&base) await page.route(`${new URL(base).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
  await page.goto("/");await expect(page.getByRole("navigation",{name:"Navigation de l’application"})).toBeVisible();
  await page.getByRole("button",{name:"Explorer",exact:true}).click();
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:"work/final-audit/part3-visiteur.png",fullPage:true});
});
for(const role of roles) test(`${role} : menus, notifications privées, responsive et session`,async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await login(page,role);
  if(role==='client'||role==='provider') {
    for(const route of ['/onboarding','/support-agent','/moderation','/finance','/operations','/staff']) {
      await page.goto(route);await expect(page).toHaveURL(/acces=refuse/);
    }
    for(const route of ['/admin','/admin/users','/admin/roles']) {
      await page.goto(route);
      if(route==='/admin') await expect(page.getByRole('heading',{name:'Compte non autorisé'})).toBeVisible();
      else { await expect(page).toHaveURL(/acces=refuse/);await expect(page.getByText('Votre compte ne possède pas l’autorisation requise pour cet espace.',{exact:true})).toBeVisible(); }
      await expect(page.getByRole('navigation',{name:'Navigation Super Admin'})).toHaveCount(0);
    }
  }
  if(role==="admin"||role==="super_admin") {
    await page.goto("/admin");const nav=page.getByRole("navigation",{name:"Navigation Super Admin"});await expect(nav).toBeVisible();
    const names=await nav.locator("button span").allTextContents();
    for(const name of names) { await nav.getByTitle(name.trim(),{exact:true}).click();await expect(page.locator(".admin-page h1")).toHaveText(name.trim()); }
    if(role==="super_admin") {await nav.getByTitle("Santé plateforme",{exact:true}).click();await expect(page.getByText("E-mails à vérifier",{exact:true})).toBeVisible();}
    await nav.getByTitle("Validations professionnelles",{exact:true}).click();
    await expect(page.getByText("Chargement…",{exact:true})).toHaveCount(0);
    await expect(page.getByText("Les dossiers sont indisponibles. Réessayez.",{exact:true})).toHaveCount(0);
    for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]) {await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`work/final-audit/part3-${role}-${width}.png`,fullPage:true});}
    await nav.getByTitle("Notifications",{exact:true}).click();await expect(page.getByRole("heading",{name:"Mes notifications"})).toBeVisible();
    await page.locator(".admin-signout").click();await expect(page.getByLabel("Adresse administrateur")).toBeVisible();
  } else {
    const prefix=role==="provider"?"/pro":role==="verification_agent"?"/onboarding":role==="support"?"/support-agent":role==="moderator"?"/moderation":"/app";
    await page.goto(prefix+(role==="client"?"/profile":""));
    const links=await page.locator(".workspace-sidebar nav a").evaluateAll(elements=>elements.map(element=>(element as HTMLAnchorElement).getAttribute("href")!));
    for(const href of [...new Set(links)]) {await page.goto(href);if(href==="/"||href.startsWith("/?")||href==="/discover") await expect(page.getByRole("navigation",{name:"Navigation de l’application"})).toBeVisible();else await expect(page.locator(".workspace-topbar h1")).toBeVisible();}
    await page.goto(`${prefix}/notifications`);await expect(page.getByRole("heading",{name:"Mes notifications"})).toBeVisible();
    await page.reload();await expect(page.getByRole("heading",{name:"Mes notifications"})).toBeVisible();
    for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[390,844]]) {await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`work/final-audit/part3-${role}-${width}.png`,fullPage:true});}
    await page.setViewportSize({width:1366,height:768});await page.getByRole("button",{name:"Se déconnecter",exact:true}).click();await expect(page).toHaveURL(/\/$/);await page.goto(`${prefix}/notifications`);await expect(page).toHaveURL(/connexion=requise/);
  }
  expect(errors).toEqual([]);
});

test.describe('MFA obligatoire',()=>{
  test('le second facteur conditionne réellement les permissions et le tableau de bord',async({page})=>{
    test.setTimeout(120000);
    const account=accounts.get('super_admin')!;
    expect((await admin.from('admin_user_roles').update({requires_mfa:true}).eq('user_id',account.id)).error).toBeNull();
    await login(page,'super_admin');await page.goto('/admin');
    await expect(page.getByRole('heading',{name:'Vérification en deux étapes'})).toBeVisible();
    await expect(page.getByRole('navigation',{name:'Navigation Super Admin'})).toHaveCount(0);
    const enrollment=page.waitForResponse(response=>response.url().endsWith('/auth/v1/factors')&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Préparer la vérification'}).click();
    const factor=await (await enrollment).json() as {totp:{secret:string}};
    await expect(page.getByAltText('Code QR de configuration du second facteur')).toBeVisible();
    await page.getByLabel('Code d’authentification').fill('000000');await page.getByRole('button',{name:'Vérifier le code'}).click();
    await expect(page.getByText('Code invalide ou expiré. Saisissez le code actuel.',{exact:true})).toBeVisible();
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of factor.totp.secret.replace(/=/g,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
    const bytes=[];for(let index=0;index+8<=bits.length;index+=8)bytes.push(parseInt(bits.slice(index,index+8),2));
    const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
    const {createHmac}=await import('node:crypto');const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();const offset=digest[19]&15;
    const otp=((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
    await page.getByLabel('Code d’authentification').fill(otp);await page.getByRole('button',{name:'Vérifier le code'}).click();
    await expect(page.getByRole('navigation',{name:'Navigation Super Admin'})).toBeVisible({timeout:20000});
    await page.reload();await expect(page.getByRole('navigation',{name:'Navigation Super Admin'})).toBeVisible();
    await page.getByRole('navigation',{name:'Navigation Super Admin'}).getByTitle('Paramètres',{exact:true}).click();
    for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]) {
      await page.setViewportSize({width,height});await checkWheel(page,width,height);
    }
    await page.locator('.admin-signout').click();await expect(page.getByLabel('Adresse administrateur')).toBeVisible();
    await page.getByLabel('Adresse administrateur').fill(account.email);await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button',{name:'Accéder à l’administration'}).click();
    await expect(page.getByRole('heading',{name:'Vérification en deux étapes'})).toBeVisible();
    await page.getByRole('button',{name:'Préparer la vérification'}).click();
    await expect(page.getByLabel('Code d’authentification')).toBeVisible();
    await expect(page.getByAltText('Code QR de configuration du second facteur')).toHaveCount(0);
  });
});

test('sante : mesures independantes et panne sans faux zero', async ({page}) => {
  await login(page, 'super_admin');
  await page.goto('/admin');
  const nav = page.getByRole('navigation', {name:'Navigation Super Admin'});
  await nav.getByTitle('Santé plateforme', {exact:true}).click();
  const grid = page.locator('.health-grid');
  await expect(grid).toBeVisible();
  await expect(grid.locator('article').filter({has:page.getByText('Application',{exact:true})}).locator('strong')).toHaveText('Opérationnelle');
  await expect(grid.locator('article').filter({has:page.getByText('Réservations 24 h',{exact:true})}).locator('strong')).toHaveText(/^\d+$/);
  await page.route('**/rest/v1/bookings?*', route => route.abort('failed'));
  await page.route('**/api/health/server', route => route.abort('failed'));
  await page.getByRole('button',{name:'Actualiser',exact:true}).click();
  await expect(grid.locator('article').filter({has:page.getByText('Application',{exact:true})}).locator('strong')).toHaveText('Indisponible');
  await expect(grid.locator('article').filter({has:page.getByText('Réservations 24 h',{exact:true})}).locator('strong')).toHaveText('Indisponible');
  await expect(grid.locator('article').filter({has:page.getByText('Notifications 24 h',{exact:true})}).locator('strong')).toHaveText(/^\d+$/);
  await page.screenshot({path:'work/final-audit/health-partial-outage.png',fullPage:true});
  await page.unroute('**/rest/v1/bookings?*');
  await page.unroute('**/api/health/server');
  await page.getByRole('button',{name:'Actualiser',exact:true}).click();
  await expect(grid.locator('article').filter({has:page.getByText('Application',{exact:true})}).locator('strong')).toHaveText('Opérationnelle');
  await page.locator('.admin-signout').click();
  await expect(page.getByLabel('Adresse administrateur')).toBeVisible();
});

test('support : demande client, reponse agent et resolution', async ({page, browser}) => {
  test.setTimeout(120000);
  const subject = `Demande recette ${run}`;
  await login(page,'client'); await page.goto('/app/support');
  await page.getByPlaceholder('Décrivez brièvement votre demande').fill(subject);
  await page.getByRole('button',{name:'Envoyer',exact:true}).click();
  await expect(page.getByText('Demande envoyée au support.',{exact:true})).toBeVisible();
  const context = await browser.newContext(); const staffPage = await context.newPage();
  try {
    await login(staffPage,'support'); await staffPage.goto('/support-agent/tickets');
    await staffPage.getByRole('button',{name:subject,exact:true}).click();
    await staffPage.getByLabel('Réponse au support').fill('Votre demande de recette a bien été reçue.');
    await staffPage.getByRole('button',{name:'Envoyer la réponse',exact:true}).click();
    await expect(staffPage.getByText('Demande mise à jour.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:subject,exact:true}).click();
    await expect(page.getByText('Votre demande de recette a bien été reçue.',{exact:true})).toBeVisible();
    await page.getByLabel('Réponse au support').fill('Merci, le problème est résolu.');
    await page.getByRole('button',{name:'Envoyer la réponse',exact:true}).click();
    await expect(page.getByText('Demande mise à jour.',{exact:true})).toBeVisible();
    await staffPage.getByRole('button',{name:'Actualiser les échanges',exact:true}).click();
    await expect(staffPage.getByText('Merci, le problème est résolu.',{exact:true})).toBeVisible();
    await staffPage.getByRole('button',{name:'Résoudre',exact:true}).click();
    await expect(staffPage.getByText('Demande mise à jour.',{exact:true})).toBeVisible();
    const ticket = await admin.from('support_tickets').select('status').eq('requester_id',accounts.get('client')!.id).eq('subject',subject).single();
    expect(ticket.data?.status).toBe('resolved');
    await page.reload(); await expect(page.locator('.control-list-row').filter({hasText:subject})).toContainText('resolved');
    await staffPage.getByRole('button',{name:'Se déconnecter',exact:true}).click(); await expect(staffPage).toHaveURL(/\/$/);
  } finally { await context.close(); }
  await page.getByRole('button',{name:'Se déconnecter',exact:true}).click(); await expect(page).toHaveURL(/\/$/);
});
