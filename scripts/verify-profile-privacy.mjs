import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co';
assert(production||url==='https://kazlvtxkbsdhbfvtqqdp.supabase.co','Explicit QA target required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const accounts=[],results=[];
async function check(name,run){try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',detail:error.message});}console.log(results.at(-1).status+' '+name);}
function otp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return ((hash.readUInt32BE(hash[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function account(role){
 const password=`QA-${randomUUID()}!`,email=`qa-integrity-${randomUUID()}@example.test`;
 const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);
 const actor={id:made.data.user.id,role,api:createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options)};accounts.push(actor);
 await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',actor.id);
 if(role){const r=await service.from('admin_roles').select('id').eq('key',role).single();assert.ifError(r.error);assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',actor.id)).error);assert.ifError((await service.from('admin_user_roles').insert({user_id:actor.id,role_id:r.data.id,requires_mfa:true})).error);}
 assert.ifError((await actor.api.auth.signInWithPassword({email,password})).error);
 if(role){const e=await actor.api.auth.mfa.enroll({factorType:'totp'});assert.ifError(e.error);assert.ifError((await actor.api.auth.mfa.challengeAndVerify({factorId:e.data.id,code:otp(e.data.totp.secret)})).error);}
 return actor;
}

try {
 const owner=await account(),other=await account();
 assert.ifError((await service.from('provider_profiles').insert({profile_id:owner.id,business_name:'QA privacy',slug:'qa-privacy-'+randomUUID(),city:'Dakar',status:'approved'})).error);
 assert.ifError((await service.from('profiles').update({phone:'+221700000001',birth_date:'1990-01-01',marketing_consent:true}).eq('id',owner.id)).error);
 const anon=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options);
 for (const [name,api] of [['anonymous',anon],['unrelated client',other.api]]) {
  await check(`${name} cannot read private professional profile fields`,async()=>{
   const r=await api.from('profiles').select('phone,birth_date,marketing_consent,terms_accepted_at').eq('id',owner.id);
   assert(r.error||!r.data?.length,'Private fields returned through public profile policy');
  });
  await check(`${name} can still read public professional identity`,async()=>{
   const r=await api.from('profiles').select('id,display_name,avatar_url').eq('id',owner.id);assert.ifError(r.error);assert.equal(r.data.length,1);
  });
 }
 await check('Disabled client cannot reactivate own account through Data API',async()=>{
  assert.ifError((await service.from('profiles').update({account_status:'disabled'}).eq('id',other.id)).error);
  await other.api.from('profiles').update({account_status:'active'}).eq('id',other.id);
  const r=await service.from('profiles').select('account_status').eq('id',other.id).single();assert.ifError(r.error);assert.equal(r.data.account_status,'disabled');
 });
 await check('Owner private profile endpoint returns only session owner',async()=>{
  const r=await owner.api.rpc('get_my_private_profile');assert.ifError(r.error);assert.equal(r.data.id,owner.id);assert.equal(r.data.phone,'+221700000001');
 });
 await check('Anonymous cannot call private profile endpoint',async()=>assert((await anon.rpc('get_my_private_profile')).error));
} finally {
 for(const actor of accounts.reverse()){await actor.api.auth.signOut({scope:'global'});assert.ifError((await service.auth.admin.deleteUser(actor.id)).error);}
 await mkdir('work/permission-audit',{recursive:true});await writeFile(`work/permission-audit/profile-privacy-${production?'production':'qa'}.json`,JSON.stringify(results,null,2));
 if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
}
