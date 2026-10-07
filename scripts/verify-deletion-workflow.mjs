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
 const owner=await account(), outsider=await account();
 await check('Client cannot forge a completed deletion request through table INSERT',async()=>assert((await owner.api.from('account_deletion_requests').insert({profile_id:owner.id,status:'completed'})).error));
 const request=await owner.api.rpc('request_account_deletion',{target_reason:'QA deletion workflow'});assert.ifError(request.error);
 await check('Repeated request reuses the same pending request',async()=>{const repeated=await owner.api.rpc('request_account_deletion',{target_reason:'QA repeated'});assert.ifError(repeated.error);assert.equal(repeated.data,request.data);});
 await check('Other client cannot read the request',async()=>{const r=await outsider.api.from('account_deletion_requests').select('id').eq('id',request.data);assert.ifError(r.error);assert.equal(r.data.length,0);});
 for(const role of [null,'admin','support','finance','verification_agent','moderator','content_manager']){
   const actor=role?await account(role):owner;
   await check((role??'client')+' cannot deactivate a user via deletion queue',async()=>assert((await actor.api.rpc('admin_begin_account_deletion',{target_request_id:request.data,target_reason:'QA forbidden action'})).error));
 }
 const manager=await account('super_admin');
 await check('Super Admin MFA deactivates requested account and keeps request pending manual erasure',async()=>{
   const r=await manager.api.rpc('admin_begin_account_deletion',{target_request_id:request.data,target_reason:'QA verified request; manual retention review'});assert.ifError(r.error);assert.equal(r.data.erased,false);
   const p=await service.from('profiles').select('is_suspended').eq('id',owner.id).single();assert.ifError(p.error);assert.equal(p.data.is_suspended,true);
   const q=await service.from('account_deletion_requests').select('status,processed_at').eq('id',request.data).single();assert.ifError(q.error);assert.equal(q.data.status,'reviewing');assert.equal(q.data.processed_at,null);
 });
 await check('Old refresh session is invalidated',async()=>assert((await owner.api.auth.refreshSession()).error));
 await check('Repeated processing is idempotent and audited once',async()=>{
   const r=await manager.api.rpc('admin_begin_account_deletion',{target_request_id:request.data,target_reason:'QA repeated handling'});assert.ifError(r.error);assert.equal(r.data.idempotent,true);
   const audit=await service.from('audit_logs').select('id').eq('entity_id',request.data).eq('action','account.deletion_review_started');assert.ifError(audit.error);assert.equal(audit.data.length,1);
 });
} finally {
 for(const actor of accounts.reverse()){await actor.api.auth.signOut({scope:'global'});assert.ifError((await service.from('account_deletion_requests').delete().eq('profile_id',actor.id)).error);assert.ifError((await service.auth.admin.deleteUser(actor.id)).error);}
 await mkdir('work/permission-audit',{recursive:true});await writeFile(`work/permission-audit/deletion-workflow-${production?'production':'qa'}.json`,JSON.stringify(results,null,2));
 if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
}

