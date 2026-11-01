import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
import {randomUUID,createHmac} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

import assert from 'node:assert/strict';
const base=process.env.REMOTE_APP_URL,url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co'&&base==='https://mata-beauty.com';
const auditRole=process.env.AUDIT_ROLE??'super_admin';
assert(['super_admin','admin','finance','support','verification_agent','moderator','content_manager','client','professional'].includes(auditRole));
const internal=!['client','professional'].includes(auditRole);
if(!production&&(url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co'||!base?.endsWith('.vercel.app')))throw Error('Explicit isolated QA target required');
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const run=randomUUID(),email=`qa-team-ui-${run}@example.test`,password=`QA-${randomUUID()}!`;
const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);const managerId=made.data.user.id;
await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',managerId);
const permissions=new Set();
if(internal){
 const role=await service.from('admin_roles').select('id').eq('key',auditRole).single();assert.ifError(role.error);
 const grants=await service.from('admin_role_permissions').select('permission_key').eq('role_id',role.data.id);assert.ifError(grants.error);
 for(const row of grants.data)permissions.add(row.permission_key);
 assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',managerId)).error);
 assert.ifError((await service.from('admin_user_roles').insert({user_id:managerId,role_id:role.data.id,requires_mfa:true})).error);
}else if(auditRole==='professional'){
 assert.ifError((await service.from('provider_profiles').insert({profile_id:managerId,business_name:'QA role matrix',slug:'qa-matrix-'+run,city:'Dakar',status:'approved'})).error);
 assert.ifError((await service.from('profiles').update({role:'provider'}).eq('id',managerId)).error);
}
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
const observations=[];
page.on('response',async r=>{
 const path=new URL(r.url()).pathname;
 if(!path.startsWith('/rest/v1/')&&path!=='/api/admin/team'&&path!=='/api/health/server')return;
 if(r.request().method()==='HEAD')return;
 const item={path,status:r.status(),shape:'pending'};observations.push(item);
 try{const data=await r.json();item.shape=Array.isArray(data)?'array':data===null?'null':typeof data;item.count=Array.isArray(data)?data.length:null;item.hasError=!!data?.error;}catch{item.shape='non-json';}
});
const rest=n=>'/rest/v1/'+n;
function endpoints(space,module){
 const key=module.key;
 if(key==='notifications')return [rest('notifications')];
 if(space==='onboarding')return [rest(key==='history'?'onboarding_events':'professional_onboarding')];
 if(space==='support'&&['dashboard','tickets','unassigned','mine','priority','escalations'].includes(key))return [rest('support_tickets')];
 if(space==='moderation'&&['dashboard','reports'].includes(key))return [rest('reports')];
 if(space==='moderation'&&key==='history')return [rest('moderation_actions')];
 if(space==='moderation'&&key==='comments')return [rest('post_comments')];
 if(space==='finance'&&key==='dashboard')return [rest('payments')];
 if(space==='finance'&&key==='audit')return [rest('financial_audit_log')];
 if(['finance','admin'].includes(space)&&key==='refunds')return [rest('refunds')];
 if(space==='operations'){
  if(key==='dashboard')return [rest('bookings')];
  if(key==='categories')return [rest('categories')];
  if(key==='support')return [rest('support_tickets')];
  if(key==='moderation')return [rest('reports')];
  if(key==='onboarding')return [rest('professional_onboarding')];
 }
 if(space==='admin'){
  const special={dashboard:auditRole==='super_admin'?'rpc/get_admin_dashboard':'rpc/get_admin_context',alerts:'fraud_alerts',activity:'audit_logs',health:'rpc/notification_delivery_health',clients:'rpc/admin_list_users',providers:'provider_profiles',services:'provider_services',categories:'categories',videos:'posts',comments:'post_comments','social-reports':'reports',tickets:'support_tickets',escalations:'support_tickets',commissions:'platform_commissions',payouts:'payouts','financial-reports':'financial_audit_log',kyc:'professional_onboarding',validations:'professional_onboarding','platform-settings':'app_settings',audit:'audit_logs',security:'admin_sessions','deletion-requests':'account_deletion_requests'};
  if(['agents','roles','permissions'].includes(key))return ['/api/admin/team'];
  if(special[key])return [rest(special[key])];
 }
 const tables={bookings:'bookings',payments:'payments',profiles:'profiles',providers:'provider_profiles',businesses:'businesses',collaborators:'collaborators',services:'provider_services',videos:'posts',reviews:'reviews',reports:'reports',audit:'audit_logs',wallets:'wallet_balances',payouts:'payouts',reconciliation:'reconciliation_runs','financial-events':'financial_security_events',commissions:'platform_commissions',disputes:'disputes',comments:'post_comments',sessions:'admin_sessions',promotions:'promotions',campaigns:'notification_campaigns',settings:'app_settings'};
 assert(tables[module.resource],`${space}/${key}: no explicit source contract`);return [rest(tables[module.resource])];
}
try{
 await login(page,email,password);await mfa(page);
 for(const spaceKey of ['onboarding','support','moderation','finance','operations','admin']){
  const space=workspaceSpaces[spaceKey];
  for(const mod of space.modules){
   const allowed=(spaceKey==='admin'&&mod.key==='dashboard')||(space.allowedAdminRoles.includes(auditRole)&&(auditRole==='super_admin'||!mod.permission||permissions.has(mod.permission)));
   if(!allowed)continue;
   const path=workspaceHref(spaceKey,mod.key),expected=endpoints(spaceKey,mod);observations.length=0;errors=[];network=[];
   try{
    await page.goto(base+path);await page.locator('.workspace-topbar h1, .admin-page h1').first().waitFor();
    const deadline=Date.now()+12000;
    while(Date.now()<deadline&&!expected.every(e=>observations.some(o=>o.path===e&&o.status===200&&o.shape!=='pending')))await page.waitForTimeout(100);
    for(const endpoint of expected)assert(observations.some(o=>o.path===endpoint&&o.status===200&&o.shape!=='pending'&&!o.hasError),`Missing successful data source ${endpoint}`);
    await page.getByText('Chargement…',{exact:true}).waitFor({state:'hidden'});
    const content=await page.locator('main').innerText();assert(!/Données momentanément indisponibles|Impossible de charger|sont indisponibles/.test(content));assert.equal(errors.length,0);
    results.push({role:auditRole,path,action:'READ',classification:'TESTABLE AUTOMATIQUEMENT',status:'PASS',scope:'UI navigation + explicit live data source; CREATE/UPDATE/DELETE not inferred',sources:observations.filter(o=>expected.includes(o.path))});
   }catch(e){results.push({role:auditRole,path,action:'READ',classification:'TESTABLE AUTOMATIQUEMENT',status:'FAIL',detail:e.message.slice(0,250),observedSources:observations.map(o=>({path:o.path,status:o.status}))});}
   console.log(results.at(-1).status+' '+auditRole+' '+path);
  }
 }
}finally{
 await browser.close();assert.ifError((await service.auth.admin.deleteUser(managerId)).error);
 await writeFile(`work/permission-audit/read-contract-${auditRole}.json`,JSON.stringify({date:new Date().toISOString(),base,role:auditRole,results},null,2));
}
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
