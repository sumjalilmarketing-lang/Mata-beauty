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
 if(role){const r=await service.from('admin_roles').select('id').eq('key',role).single();assert.ifError(r.error);assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',actor.id)).error);assert.ifError((await service.from('admin_user_roles').insert({user_id:actor.id,role_id:r.data.id,requires_mfa:false})).error);}
 assert.ifError((await actor.api.auth.signInWithPassword({email,password})).error);
 return actor;
}


try {
 for(const role of ['super_admin','admin','support','finance','verification_agent','moderator','content_manager']){
  const actor=await account(role),permission=role==='finance'?'payments.read':role==='content_manager'?'providers.read':'users.read';
  await check(role+' legacy flag does not waive MFA',async()=>{const r=await actor.api.rpc('admin_mfa_required');assert.ifError(r.error);assert.equal(r.data,true);});
  await check(role+' legacy AAL1 has no privileged permission',async()=>{const r=await actor.api.rpc('has_admin_permission',{required_permission:permission});assert.ifError(r.error);assert.equal(r.data,false);});
  const enrolled=await actor.api.auth.mfa.enroll({factorType:'totp'});assert.ifError(enrolled.error);assert.ifError((await actor.api.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:otp(enrolled.data.totp.secret)})).error);
  await check(role+' gains intended permission only after MFA',async()=>{const r=await actor.api.rpc('has_admin_permission',{required_permission:permission});assert.ifError(r.error);assert.equal(r.data,true);});
 }
}finally{
 for(const actor of accounts.reverse()){await actor.api.auth.signOut({scope:'global'});assert.ifError((await service.auth.admin.deleteUser(actor.id)).error);}
 await mkdir('work/permission-audit',{recursive:true});await writeFile(`work/permission-audit/legacy-mfa-${production?'production':'qa'}.json`,JSON.stringify(results,null,2));
 if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
}

