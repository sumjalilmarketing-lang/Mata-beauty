import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.REMOTE_APP_URL;
const url=process.env.REMOTE_SUPABASE_URL;
const production=url==='https://qjdwxdbvrxedyfolnpol.supabase.co';
if(!base || !['https://qjdwxdbvrxedyfolnpol.supabase.co','https://kazlvtxkbsdhbfvtqqdp.supabase.co'].includes(url))throw new Error('Explicit QA target required');
if(production && (base!=='https://mata-beauty.com'||process.env.ALLOW_PRODUCTION_QA!=='mata-beauty.com'))throw new Error('Production QA authorization required');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const result={origin:base,cases:[],cleanup:false};
const ids=[];
const sessions=[];
const output=process.env.AUTH_QA_OUTPUT||'work/auth-audit/returns';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const headers=process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{};
const contextOptions={viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:headers};
async function fixture(type){
 const email=`codex-auth-${randomUUID()}@example.test`,password=`QA-${randomUUID()}!`;
 let user;
 if(type==='recovery'){
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true,display_name:'QA Auth Client'}});
  if(created.error)throw new Error('Fixture creation failed');user=created.data.user;ids.push(user.id);
 }
 const generated=await admin.auth.admin.generateLink({type,email,...(type==='signup'?{password}:{}),options:{redirectTo:base+'/auth/update-password',data:{legal_accepted:true,display_name:'QA Auth Client'}}});
 if(generated.error)throw new Error('Fixture link generation failed');
 user=generated.data.user;if(!ids.includes(user.id))ids.push(user.id);
 await admin.auth.admin.updateUserById(user.id,{app_metadata:{qa_suppress_email:true}});
 await admin.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',user.id);
 return {email,password,user,properties:generated.data.properties};
}
async function record(name,run){
 try{await run();result.cases.push({name,status:'PASS'});console.log(`PASS ${name}`);}
 catch(error){result.cases.push({name,status:'FAIL',error:error instanceof Error?error.name:'Unknown',location:error instanceof Error?error.stack?.split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,2):[]});console.log(`FAIL ${name}`);throw new Error(`Auth QA failed: ${name}`);}
}
try{
 for(const type of ['invite','recovery']){
  await record(`Legacy ${type}: fresh browser, valid session, update, login`,async()=>{
   const fixtureData=await fixture(type);
   const verification=await fetch(fixtureData.properties.action_link,{redirect:'manual'});
   const landing=verification.headers.get('location');
   result.lastRedirect=landing?{origin:new URL(landing).origin,path:new URL(landing).pathname}:null;
   assert(landing&&new URL(landing).origin===new URL(base).origin);
   const context=await browser.newContext(contextOptions),page=await context.newPage();
   let updates=0;page.on('request',request=>{if(request.method()==='PUT'&&new URL(request.url()).pathname==='/auth/v1/user')updates++;});
   await page.goto(landing);
   const button=page.getByRole('button',{name:'Mettre à jour',exact:true});await button.waitFor();
   await page.waitForFunction(()=>!document.querySelector('button.primary-button')?.disabled);
   assert(!page.url().includes('access_token'));assert(!page.url().includes('refresh_token'));
   await page.reload();await page.waitForFunction(()=>!document.querySelector('button.primary-button')?.disabled);
   const password=`Changed-${randomUUID()}!`;
   await page.getByLabel('Nouveau mot de passe',{exact:true}).fill(password);
   await page.getByLabel('Confirmation',{exact:true}).fill(password);
   await button.click();await page.getByRole('status').filter({hasText:'Mot de passe mis à jour'}).waitFor();
   assert.equal(updates,1);
   const client=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});sessions.push(client);
   const login=await client.auth.signInWithPassword({email:fixtureData.email,password});assert(!login.error);assert.equal(login.data.user.id,fixtureData.user.id);
   const profile=await client.from('profiles').select('role,account_status').eq('id',fixtureData.user.id).single();assert.equal(profile.data?.role,'client');
   await page.screenshot({path:`${output}/${type}.png`});
   if(type==='recovery'){
    await page.goto(base+'/?connexion=requise&returnTo=%2Fapp%2Fprofile');
    await page.getByLabel('Adresse e-mail',{exact:true}).fill(fixtureData.email);
    await page.getByLabel('Mot de passe',{exact:true}).fill('Wrong-password-for-QA');
    await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    await page.getByRole('status').filter({hasText:'E-mail ou mot de passe incorrect'}).waitFor();
    result.cases.push({name:'Incorrect password rejected in browser',status:'PASS'});
    await page.getByLabel('Mot de passe',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    await page.waitForURL(/\/app/);
    await page.goto(base+'/app/profile');await page.getByRole('region',{name:'Mon profil client'}).waitFor();
    await page.reload();await page.getByRole('region',{name:'Mon profil client'}).waitFor();
    result.cases.push({name:'Email login and refresh retain Client profile',status:'PASS'});
    for(const path of ['/onboarding','/admin','/super-admin']){
     const response=await page.goto(base+path);
     result.lastProtectedRoute={requested:path,finalPath:new URL(response.url()).pathname,query:new URL(response.url()).search,status:response.status()};
     if(path==='/onboarding')assert(new URL(response.url()).searchParams.get('acces')==='refuse');
     else await page.getByRole('heading',{name:'Compte non autorisé',exact:true}).waitFor();
    }
    result.cases.push({name:'Client denied direct onboarding/admin/super-admin routes',status:'PASS'});
    await client.auth.signOut({scope:'global'});
    await page.goto(base+'/app/profile');await page.waitForURL(/connexion=requise/);
    result.cases.push({name:'Revoked session cannot reopen protected Client profile',status:'PASS'});
   }
   await context.close();
  });
 }
 for(const type of ['signup','invite','recovery']){
  await record(`Email ${type}: server verification across browsers and single-use link`,async()=>{
   const fixtureData=await fixture(type);
   const link=`${base}/auth/confirm?token_hash=${encodeURIComponent(fixtureData.properties.hashed_token)}&type=${type}`;
   const context=await browser.newContext(contextOptions),page=await context.newPage();
   await page.goto(link);await page.waitForURL(type==='signup'?/\/app\/profile/:/\/auth\/update-password/);
   assert(!page.url().includes('token_hash'));
   assert((await context.cookies()).some(cookie=>cookie.name.startsWith('sb-')&&cookie.name.includes('auth-token')));
   if(type!=='signup')await page.waitForFunction(()=>!document.querySelector('button.primary-button')?.disabled);
   const profile=await admin.from('profiles').select('role,account_status').eq('id',fixtureData.user.id).single();assert.equal(profile.data?.role,'client');assert.equal(profile.data?.account_status,'active');
   const second=await browser.newContext(contextOptions),secondPage=await second.newPage();
   const secondResponse=await secondPage.goto(link);
   assert.equal(new URL(secondResponse.url()).searchParams.get('auth_error'),'email_link_invalid');
   assert(!(await second.cookies()).some(cookie=>cookie.name.startsWith('sb-')&&cookie.name.includes('auth-token')));
   const chunks=(await context.cookies()).filter(cookie=>cookie.name.includes('auth-token')).sort((a,b)=>a.name.localeCompare(b.name));
   const value=chunks.map(cookie=>cookie.value).join('');
   if(value.startsWith('base64-')){
    const session=JSON.parse(Buffer.from(value.slice(7),'base64url').toString());
    if(session.access_token)await admin.auth.admin.signOut(session.access_token,'global');
   }
   await context.close();await second.close();
  });
 }
 await record('Missing and expired session cannot submit a password',async()=>{
  for(const suffix of ['', '#error_code=otp_expired&error_description=private-token']){
   const context=await browser.newContext(contextOptions),page=await context.newPage();
   await page.goto(base+'/auth/update-password'+suffix);
   await page.getByRole('link',{name:'Demander un nouveau lien'}).waitFor();
   assert(await page.getByRole('button',{name:'Mettre à jour',exact:true}).isDisabled());
   assert(!(await page.locator('body').innerText()).includes('private-token'));await context.close();
  }
 });
 await record('Signup mobile: confirmation, legal consent and accessible Google action',async()=>{
  const context=await browser.newContext(contextOptions),page=await context.newPage();
  await page.goto(base+'/?connexion=requise');
  await page.getByRole('button',{name:'Créer un compte',exact:true}).click();
  await page.getByLabel('Nom complet',{exact:true}).fill('QA Auth');
  await page.getByLabel('Adresse e-mail',{exact:true}).fill('qa@example.test');
  await page.getByLabel('Mot de passe',{exact:true}).fill('NotASentPassword-123');
  await page.getByLabel('Confirmer le mot de passe',{exact:true}).fill('DifferentPassword-123');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Créer le compte',exact:true}).click();
  await page.getByRole('status').filter({hasText:'ne correspondent pas'}).waitFor();
  const google=page.getByRole('button',{name:'Continuer avec Google',exact:true});await google.scrollIntoViewIfNeeded();
  const box=await google.boundingBox();assert(box&&box.x>=0&&box.x+box.width<=390);
  await page.screenshot({path:`${output}/signup-mobile.png`});await context.close();
 });
}finally{
 for(const session of sessions)await session.auth.signOut({scope:'global'});
 await browser.close();let cleaned=0;
 for(const id of ids){const deleted=await admin.auth.admin.deleteUser(id);if(!deleted.error)cleaned++;}
 result.cleanup=cleaned===ids.length;
 await writeFile(output+'/results.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({cases:result.cases,cleanup:result.cleanup}));
}
