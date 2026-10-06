import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url=process.env.REMOTE_SUPABASE_URL??"";
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY??"",{auth:{persistSession:false}});
const password=`QA-${randomUUID()}!`,run=randomUUID();
const roles=["client","provider","verification_agent","support","moderator","admin","super_admin"];
const accounts=new Map<string,{id:string;email:string}>();
async function login(page:Page,role:string) {
  const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET,base=process.env.REMOTE_APP_URL;
  if(bypass&&base) await page.route(`${new URL(base).origin}/**`,route=>route.continue({headers:{...route.request().headers(),"x-vercel-protection-bypass":bypass,"x-vercel-set-bypass-cookie":"true"}}));
  await page.goto("/");
  await page.getByRole("navigation",{name:"Navigation de l’application"}).getByRole("button",{name:"Profil"}).click();
  await page.getByLabel("Adresse e-mail").fill(accounts.get(role)!.email);await page.getByLabel("Mot de passe",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Se connecter",exact:true}).click();await expect(page).toHaveURL(/\/app/,{timeout:30000});
}
test.beforeAll(async()=>{
  if(url!=="https://kazlvtxkbsdhbfvtqqdp.supabase.co") throw new Error("QA only");
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
    await page.setViewportSize({width:1366,height:768});await page.getByRole("button",{name:"Se déconnecter",exact:true}).click();await page.goto(`${prefix}/notifications`);await expect(page).toHaveURL(/connexion=requise/);
  }
  expect(errors).toEqual([]);
});
