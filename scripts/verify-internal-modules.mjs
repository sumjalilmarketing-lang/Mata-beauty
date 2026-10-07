import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
import {randomUUID,createHmac} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

import assert from 'node:assert/strict';
const base=process.env.REMOTE_APP_URL,url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co'&&base==='https://mata-beauty.com';
if(!production&&(url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co'||!base?.endsWith('.vercel.app')))throw Error('Explicit isolated QA target required');
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const run=randomUUID(),email=`qa-team-ui-${run}@example.test`,password=`QA-${randomUUID()}!`;
const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);const managerId=made.data.user.id;
await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',managerId);
const role=await service.from('admin_roles').select('id').eq('key','super_admin').single();assert.ifError(role.error);
assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',managerId)).error);
assert.ifError((await service.from('admin_user_roles').insert({user_id:managerId,role_id:role.data.id,requires_mfa:true})).error);
const browser=await chromium.launch(),results=[];
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
try{
 await login(page,email,password);await mfa(page);
 for(const key of ['onboarding','support','moderation','finance','operations','admin']){
  const space=workspaceSpaces[key];
  for(const mod of space.modules){
   network=[];errors=[];const path=workspaceHref(key,mod.key);let clicked=false;
   try{
    const candidates=await page.locator('a[href="'+path+'"]').count();
    if(candidates&&await page.locator('a[href="'+path+'"]').first().isVisible()){await page.locator('a[href="'+path+'"]').first().click();clicked=true;}else await page.goto(base+path);
    await page.waitForURL(base+path);
    await page.locator('.workspace-topbar h1, .admin-page h1').first().waitFor();
    await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{});
    await page.getByText('Chargement…',{exact:true}).waitFor({state:'hidden',timeout:12000}).catch(()=>{});
    const text=await page.locator('main').innerText().catch(()=>page.locator('body').innerText());
    const unavailable=/Données momentanément indisponibles|Impossible de charger|sont indisponibles/.test(text);
    const loading=/Chargement…/.test(text);
    results.push({space:key,module:mod.key,label:mod.label,path,clicked,observation:unavailable?'Indisponible':loading?'Chargement persistant':'Écran rendu',status:unavailable||loading||errors.length?'FAIL':'NOT TESTED',network:[...network],errors:[...errors]});
   }catch(e){results.push({space:key,module:mod.key,path,clicked,status:'FAIL',observation:e.message.slice(0,200),network:[...network],errors:[...errors]});}
   console.log(key+'/'+mod.key+': '+results.at(-1).observation);
  }
 }
}finally{
 await browser.close();assert.ifError((await service.auth.admin.deleteUser(managerId)).error);
 await writeFile('work/permission-audit/modules-production.json',JSON.stringify({date:new Date().toISOString(),base,role:'super_admin',results},null,2));
}

