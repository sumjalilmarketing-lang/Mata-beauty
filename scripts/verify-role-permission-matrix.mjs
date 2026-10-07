import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co';
assert(production||url==='https://kazlvtxkbsdhbfvtqqdp.supabase.co','Explicit QA target required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const accounts=[],results=[];
function otp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return ((hash.readUInt32BE(hash[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function account(role,verify=true){
 const password=`QA-${randomUUID()}!`,email=`qa-integrity-${randomUUID()}@example.test`;
 const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);
 const actor={id:made.data.user.id,role,api:createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options)};accounts.push(actor);
 await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',actor.id);
 if(role){const r=await service.from('admin_roles').select('id').eq('key',role).single();assert.ifError(r.error);assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',actor.id)).error);assert.ifError((await service.from('admin_user_roles').insert({user_id:actor.id,role_id:r.data.id,requires_mfa:true})).error);}
 assert.ifError((await actor.api.auth.signInWithPassword({email,password})).error);
 if(role&&verify){const e=await actor.api.auth.mfa.enroll({factorType:'totp'});assert.ifError(e.error);assert.ifError((await actor.api.auth.mfa.challengeAndVerify({factorId:e.data.id,code:otp(e.data.totp.secret)})).error);}
 return actor;
}

const ts=await import('typescript');
const source=await readFile('lib/domain/admin.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {adminRoleKeys,adminPermissionKeys,defaultRolePermissions}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
async function phase(actor,role,assurance){
 for(const permission of adminPermissionKeys){
  const expected=assurance==='aal2'&&defaultRolePermissions[role]?.includes(permission)||false;
  const r=await actor.api.rpc('has_admin_permission',{required_permission:permission});
  results.push({role,api:'has_admin_permission',permission,action:permission.split('.')[1],assurance,expected,observed:r.data,status:!r.error&&r.data===expected?'PASS':'FAIL',error:r.error?.message});
 }
 console.log(role+' '+assurance+' '+results.slice(-adminPermissionKeys.length).filter(r=>r.status==='PASS').length+'/'+adminPermissionKeys.length);
}
try{
 for(const role of ['client','professional',...adminRoleKeys]){
  const internal=adminRoleKeys.includes(role),actor=await account(internal?role:undefined,false);
  if(role==='professional'){
   assert.ifError((await service.from('provider_profiles').insert({profile_id:actor.id,business_name:'QA permission matrix',slug:'qa-gates-'+randomUUID(),city:'Dakar',status:'approved'})).error);
   assert.ifError((await service.from('profiles').update({role:'provider'}).eq('id',actor.id)).error);
   assert.ifError((await service.from('account_roles').upsert({profile_id:actor.id,role:'professional'})).error);
  }
  await phase(actor,role,'aal1');
  if(internal){const e=await actor.api.auth.mfa.enroll({factorType:'totp'});assert.ifError(e.error);assert.ifError((await actor.api.auth.mfa.challengeAndVerify({factorId:e.data.id,code:otp(e.data.totp.secret)})).error);await phase(actor,role,'aal2');}
 }
}finally{
 for(const actor of accounts.reverse()){await actor.api.auth.signOut({scope:'global'});assert.ifError((await service.auth.admin.deleteUser(actor.id)).error);}
 await writeFile(`work/permission-audit/permission-gates-${production?'production':'qa'}.json`,JSON.stringify({date:new Date().toISOString(),results},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
