import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
import {randomUUID,createHmac} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

import assert from 'node:assert/strict';
const base=process.env.REMOTE_APP_URL,url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co'&&base==='https://mata-beauty.com';
const auditRole=process.env.AUDIT_ROLE??'super_admin';
assert(['super_admin','admin','finance','support','verification_agent','moderator','content_manager','client','professional','staff'].includes(auditRole));
const internal=!['client','professional','staff'].includes(auditRole);
if(!production&&(url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co'||!base?.endsWith('.vercel.app')))throw Error('Explicit isolated QA target required');
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const run=randomUUID(),email=`qa-team-ui-${run}@example.test`,password=`QA-${randomUUID()}!`;
const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);const managerId=made.data.user.id;
await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',managerId);
const permissions=new Set();
let staffOwnerId;
try {
if(internal){
 const role=await service.from('admin_roles').select('id').eq('key',auditRole).single();assert.ifError(role.error);
 const grants=await service.from('admin_role_permissions').select('permission_key').eq('role_id',role.data.id);assert.ifError(grants.error);
 for(const row of grants.data)permissions.add(row.permission_key);
 assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',managerId)).error);
 assert.ifError((await service.from('admin_user_roles').insert({user_id:managerId,role_id:role.data.id,requires_mfa:true})).error);
}else if(auditRole==='professional'){
 assert.ifError((await service.from('provider_profiles').insert({profile_id:managerId,business_name:'QA role matrix',slug:'qa-matrix-'+run,city:'Dakar',status:'approved'})).error);
 assert.ifError((await service.from('profiles').update({role:'provider'}).eq('id',managerId)).error);
 assert.ifError((await service.from('account_roles').upsert({profile_id:managerId,role:'professional'},{onConflict:'profile_id,role'})).error);
}
if(auditRole==='staff'){
 assert(!production,'Staff fixture provisioning is authorized only in isolated QA');
 const owner=await service.auth.admin.createUser({email:`qa-ux-owner-${run}@example.test`,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(owner.error);staffOwnerId=owner.data.user.id;
 assert.ifError((await service.from('provider_profiles').insert({profile_id:staffOwnerId,business_name:'QA accessibility salon',slug:'qa-ux-'+run,city:'Dakar',status:'approved'})).error);
 const business=await service.from('businesses').insert({owner_id:staffOwnerId,name:'QA accessibility salon',slug:'qa-ux-'+run,address:'Adresse de recette',city:'Dakar',status:'approved'}).select('id').single();assert.ifError(business.error);
 assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',staffOwnerId)).error);
 const approverRole=await service.from('admin_roles').select('id').eq('key','admin').single();assert.ifError(approverRole.error);
 assert.ifError((await service.from('admin_user_roles').insert({user_id:staffOwnerId,role_id:approverRole.data.id,requires_mfa:true})).error);
 const approver=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 assert.ifError((await approver.auth.signInWithPassword({email:`qa-ux-owner-${run}@example.test`,password})).error);
 const factor=await approver.auth.mfa.enroll({factorType:'totp',friendlyName:'Accessibility QA'});assert.ifError(factor.error);
 assert.ifError((await approver.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:otp(factor.data.totp.secret)})).error);
 assert.ifError((await approver.from('businesses').update({status:'approved'}).eq('id',business.data.id)).error);
 assert.ifError((await service.from('collaborators').insert({business_id:business.data.id,profile_id:managerId,display_name:'QA employee',is_active:true})).error);
 const staffApi=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 assert.ifError((await staffApi.auth.signInWithPassword({email,password})).error);
 const visible=await staffApi.from('collaborators').select('id',{count:'exact',head:true}).eq('profile_id',managerId).eq('is_active',true);
 console.log('Staff fixture RLS visibility',JSON.stringify({count:visible.count,error:visible.error?.message}));
 assert.ifError(visible.error);assert.equal(visible.count,1,'Staff fixture must be visible to its own session');
}
} catch(error) {
 assert.ifError((await service.auth.admin.deleteUser(managerId)).error);
 if(staffOwnerId)assert.ifError((await service.auth.admin.deleteUser(staffOwnerId)).error);
 throw error;
}
const browser=await chromium.launch({channel:'chromium'}),results=[];
const headers=production?{}:{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET};
const context=await browser.newContext({extraHTTPHeaders:headers}),page=await context.newPage();
function otp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return ((hash.readUInt32BE(hash[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function mfa(page){await page.getByRole('heading',{name:'Vérification en deux étapes'}).waitFor();const response=page.waitForResponse(r=>r.url().endsWith('/auth/v1/factors')&&r.request().method()==='POST');await page.getByRole('button',{name:'Préparer la vérification'}).click();const factor=await(await response).json();await page.getByLabel('Code d’authentification').fill(otp(factor.totp.secret));await page.getByRole('button',{name:'Vérifier le code'}).click();await page.getByRole('navigation',{name:'Navigation Super Admin'}).waitFor();}
async function login(page,email,password){await page.goto(base+'/admin');await page.getByLabel('Adresse administrateur').fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Accéder à l’administration'}).click();}
await mkdir('work/permission-audit',{recursive:true});

const ts=await import('typescript');
const source=await readFile('lib/navigation/spaces.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {workspaceSpaces,workspaceHref}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(30000);
let network=[],errors=[];
page.on('response',r=>{if(r.status()>=400)network.push({status:r.status(),url:new URL(r.url()).pathname});});
page.on('pageerror',e=>errors.push(e.message));
const observations=[];
page.on('response',async r=>{
 const path=new URL(r.url()).pathname;
 if(!path.startsWith('/rest/v1/')&&path!=='/api/admin/team'&&path!=='/api/health/server')return;
 if(r.request().method()==='HEAD')return;
 const item={path,status:r.status(),shape:'pending'};observations.push(item);
 try{const data=await r.json();item.shape=Array.isArray(data)?'array':data===null?'null':typeof data;item.count=Array.isArray(data)?data.length:null;item.hasError=!!data?.error;}catch{item.shape='non-json';}
});
const output=process.env.AUTH_QA_OUTPUT??'work/ux-audit/before';await mkdir(output,{recursive:true});
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
const sizes=[[375,812],[390,844],[768,1024],[1366,768],[1440,900],[1920,1080]];
const interactions=[];
async function capture(label){
 await page.waitForTimeout(800);
 if(process.env.UX_CSS)await page.addStyleTag({path:process.env.UX_CSS});
 await page.evaluate(axe);
 const scan=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length})),passes:r.passes.length};});
 const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,components:document.querySelectorAll('button,input,select,textarea,a,table,[role="dialog"]').length}));
 await page.screenshot({path:`${output}/${label}.png`,fullPage:true});
 results.push({role:auditRole,path:new URL(page.url()).pathname,label,checkedAt:new Date().toISOString(),prototype:!!process.env.UX_CSS,...state,...scan});
 await writeFile(`${output}/results-${auditRole}.json`,JSON.stringify(results,null,2));
 console.log(label+' violations='+scan.violations.map(v=>v.id+':'+v.nodes.length).join(',')+' overflow='+state.overflow);
}
try{
 if(internal){await login(page,email,password);await mfa(page);}else{
  await page.goto(base+'/');await page.getByRole('navigation',{name:'Navigation de l’application'}).getByRole('button',{name:/^(Profil|Se connecter à MATA Beauty)$/}).click();
  await page.getByLabel('Adresse e-mail').fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await page.waitForURL(/\/app/);
 }
 const paths=!internal?Object.entries(workspaceSpaces).filter(([k])=>(auditRole==='client'?['client']:auditRole==='staff'?['staff']:['pro','salon']).includes(k)).flatMap(([k,s])=>s.modules.map(m=>workspaceHref(k,m.key))):process.env.UX_ALL==='1'?Object.entries(workspaceSpaces).filter(([k])=>['onboarding','support','moderation','finance','operations','admin'].includes(k)).flatMap(([k,s])=>s.modules.filter(m=>s.allowedAdminRoles.includes(auditRole)&&(auditRole==='super_admin'||!m.permission||permissions.has(m.permission))).map(m=>workspaceHref(k,m.key))):['/admin/administrators','/admin','/onboarding','/support-agent','/finance','/moderation','/operations'];
 for(const path of [...new Set(paths)].filter(path=>!process.env.UX_PATHS||process.env.UX_PATHS.split(',').includes(path))){
  await page.goto(base+path);assert.equal(new URL(page.url()).pathname,path,`Unexpected redirect for ${path}: ${page.url()}`);await page.locator('.workspace-topbar h1,.admin-page h1,.premium-bottom-nav').first().waitFor();
  await page.getByText('Chargement…',{exact:true}).waitFor({state:'hidden'}).catch(()=>{});
  for(const theme of ['light','dark']){
   await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width:1440,height:900});if(process.env.UX_ALL_SIZES!=='1')await capture(path.replaceAll('/','-')+'-'+theme);
   for(const [width,height] of sizes){await page.setViewportSize({width,height});if(process.env.UX_ALL_SIZES==='1')await capture(path.replaceAll('/','-')+'-'+theme+'-'+width);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);interactions.push({path,theme,width,height,action:'horizontal overflow',status:overflow?'FAIL':'PASS'});if(overflow){await page.screenshot({path:`${output}/overflow-${path.replaceAll('/','-')}-${theme}-${width}.png`,fullPage:true});const nodes=await page.locator('body *').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1}).map(n=>({tag:n.tagName,className:n.className,width:n.getBoundingClientRect().width,text:n.textContent?.slice(0,80)})).slice(-20));await writeFile(`${output}/overflow-${path.replaceAll('/','-')}-${theme}-${width}.json`,JSON.stringify(nodes,null,2));}}
  }
  if(process.env.UX_TABLE==='1'&&path==='/operations/categories'){
   await page.setViewportSize({width:375,height:812});const table=page.getByRole('region',{name:'Liste des catégories',exact:true});await table.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(300);assert(await table.evaluate(n=>n.scrollLeft>0),'Category table must scroll horizontally by keyboard');
   await table.getByRole('button',{name:'Modifier',exact:true}).first().click();await page.getByRole('heading',{name:'Modifier la catégorie',exact:true}).waitFor();assert((await page.locator('.admin-catalog-form').getByLabel('Nom',{exact:true}).inputValue()).length>0);
   await capture('catalog-edit-mobile');await page.locator('.admin-catalog-form').getByRole('button',{name:'Annuler',exact:true}).click();assert.equal(await page.locator('.admin-catalog-form').getByLabel('Nom',{exact:true}).inputValue(),'');
   interactions.push({path,action:'Keyboard table scroll, open category editor and cancel without saving',status:'PASS'});
  }
 }
 if(auditRole==='super_admin'){

 await page.goto(base+'/admin/administrators');await page.getByRole('heading',{name:'Équipe MATA Beauty'}).waitFor();
 const card=page.locator('article').filter({hasText:email});await card.getByRole('button',{name:'Modifier le rôle',exact:true}).click();
 await page.getByLabel('Nouveau rôle').selectOption('admin');await page.getByLabel('Justification').fill('Recette lisibilité : formulaire non envoyé');
 for(const theme of ['light','dark'])for(const [width,height] of [[375,812],[390,844],[768,1024],[1366,768],[1440,900],[1920,1080]]){await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height});await capture(`role-dialog-${theme}-${width}`);}
 if(process.env.UX_INTERACTIONS==='1'){
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Annuler',exact:true}).focus();await page.keyboard.press('Tab');assert(await page.getByLabel('Nouveau rôle').evaluate(n=>n===document.activeElement));await page.keyboard.press('Shift+Tab');assert(await dialog.getByRole('button',{name:'Annuler',exact:true}).evaluate(n=>n===document.activeElement));
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert(await card.getByRole('button',{name:'Modifier le rôle',exact:true}).evaluate(n=>n===document.activeElement));interactions.push({action:'Role dialog keyboard trap, Escape and focus return',status:'PASS'});
  await card.getByRole('button',{name:'Modifier le rôle',exact:true}).click();
 }
 if(process.env.UX_ERRORS==='1'){
  await page.route('**/api/admin/team',async route=>{if(route.request().method()!=='POST')return route.continue();await new Promise(resolve=>setTimeout(resolve,1000));await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Service temporairement indisponible. Réessayez.'})});});
  await page.getByLabel('Justification').fill('Recette erreur réseau sans mutation');await page.getByRole('dialog').getByRole('button',{name:'Confirmer',exact:true}).click();
  assert(await page.getByRole('button',{name:'Mise à jour…',exact:true}).isDisabled());await page.getByText('Service temporairement indisponible. Réessayez.',{exact:true}).waitFor();
  await capture('role-error-dark');assert.equal(await page.getByRole('dialog').getByText('Service temporairement indisponible. Réessayez.',{exact:true}).count(),1,'The error must be rendered inside the open dialog');
  interactions.push({action:'Role dialog loading and visible failure, intercepted API without mutation',status:'PASS'});await page.unroute('**/api/admin/team');
 }
 await page.getByRole('dialog').getByRole('button',{name:'Annuler',exact:true}).click();
 assert(await card.getByRole('button',{name:'Modifier le rôle',exact:true}).evaluate(n=>n===document.activeElement));
 await page.getByRole('button',{name:'+ Inviter un membre'}).click();await page.getByLabel('Prénom',{exact:true}).fill('Recette');await page.getByLabel('Nom',{exact:true}).fill('Lisibilité');
 for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await capture(`invite-${theme}`);}
 }
}catch(e){console.log('AUDIT ERROR '+e.message);process.exitCode=1;}finally{
 await browser.close();assert.ifError((await service.auth.admin.deleteUser(managerId)).error);
 if(staffOwnerId)assert.ifError((await service.auth.admin.deleteUser(staffOwnerId)).error);
 await writeFile(`${output}/results-${auditRole}.json`,JSON.stringify(results,null,2));
 await writeFile(`${output}/interactions-${auditRole}.json`,JSON.stringify(interactions,null,2));
 await writeFile(`${output}/diagnostics-${auditRole}.json`,JSON.stringify({network,errors,observations},null,2));
 console.log('Cleanup confirmed; observations='+results.length);
}
