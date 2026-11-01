import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.env.REMOTE_SUPABASE_URL;
if(url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co')throw Error('Explicit isolated QA target required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const accounts=[],results=[];
async function check(name,run){await run();results.push({name,status:'PASS'});console.log('PASS '+name);}
function otp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return ((hash.readUInt32BE(hash[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function mfa(api){const e=await api.auth.mfa.enroll({factorType:'totp'});assert.ifError(e.error);const v=await api.auth.mfa.challengeAndVerify({factorId:e.data.id,code:otp(e.data.totp.secret)});assert.ifError(v.error);}
async function account(role){const email=`qa-team-${randomUUID()}@example.test`,password=`QA-${randomUUID()}!`;const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);const id=made.data.user.id,api=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options);accounts.push({id,api});await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',id);if(role){const r=await service.from('admin_roles').select('id').eq('key',role).single();assert.ifError(r.error);assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',id)).error);assert.ifError((await service.from('admin_user_roles').insert({user_id:id,role_id:r.data.id,requires_mfa:true})).error);}assert.ifError((await api.auth.signInWithPassword({email,password})).error);return{id,api,email,password};}

try {
const manager=await account('super_admin'), client=await account(), target=await account(), retained=await account();
const command=(id,action,operationId=randomUUID())=>({target_user_id:id,target_action:action,target_reason:'QA lifecycle test only',operation_id:operationId,confirmation:'SUPPRIMER'});
await check('AAL1 manager denied lifecycle',async()=>assert((await manager.api.rpc('admin_manage_account',command(target.id,'archive'))).error));
await mfa(manager.api);
await check('Client denied list, preview, lifecycle and state mutation',async()=>{
 assert((await client.api.rpc('admin_managed_accounts')).error);assert((await client.api.rpc('admin_account_preview',{target_user_id:target.id})).error);assert((await client.api.rpc('admin_manage_account',command(target.id,'archive'))).error);
 assert((await client.api.from('admin_account_state').insert({user_id:client.id,archived_at:new Date().toISOString()})).error);
 assert.deepEqual((await client.api.from('admin_account_operations').select('*')).data,[]);
});
await check('Internal non-Super-Admin roles denied account lifecycle after MFA',async()=>{
 for(const role of ['finance','support','verification_agent','moderator','content_manager','admin']) {
  const member=await account(role);await mfa(member.api);
  assert((await member.api.rpc('admin_managed_accounts')).error);
  assert((await member.api.rpc('admin_account_preview',{target_user_id:target.id})).error);
  for(const action of ['suspend','archive','reactivate','delete'])assert((await member.api.rpc('admin_manage_account',command(target.id,action))).error);
 }
});
await check('Protected own Super Admin cannot be deleted, suspended or archived',async()=>{for(const action of ['delete','suspend','archive'])assert((await manager.api.rpc('admin_manage_account',command(manager.id,action))).error);});
await check('Search and explicit server test marker',async()=>{const r=await manager.api.rpc('admin_managed_accounts',{search_term:target.email});assert.ifError(r.error);assert.equal(r.data.length,1);assert.equal(r.data[0].is_test,true);});
await check('Archive revokes sessions and keeps profile; reactivation is explicit',async()=>{
 assert.ifError((await target.api.rpc('synchronize_account_status')).error);
 assert.ifError((await manager.api.rpc('admin_manage_account',command(target.id,'archive'))).error);
 assert.equal((await service.from('profiles').select('is_suspended').eq('id',target.id).single()).data.is_suspended,true);
 assert((await target.api.rpc('synchronize_account_status')).error, 'Suspended session must not change account status');
 assert((await target.api.auth.refreshSession()).error);
 assert((await manager.api.rpc('admin_set_user_suspension',{target_user_id:target.id,suspended:false,reason:'QA must not bypass archive'})).error);
 assert.ifError((await manager.api.rpc('admin_manage_account',command(target.id,'reactivate'))).error);
 assert.equal((await service.from('profiles').select('account_status').eq('id',target.id).single()).data.account_status,'active');
 assert.ifError((await target.api.auth.signInWithPassword({email:target.email,password:target.password})).error);
});
await check('Retained dossier blocks irreversible deletion and remains intact',async()=>{
 assert.ifError((await service.from('provider_profiles').insert({profile_id:retained.id,business_name:'QA retained dossier',slug:'qa-retained-'+randomUUID(),city:'Dakar',status:'draft'})).error);
 const p=await manager.api.rpc('admin_account_preview',{target_user_id:retained.id});assert.ifError(p.error);assert.equal(p.data.canDelete,false);assert(p.data.dependencies.some(d=>d.table==='provider_profiles'));
 assert((await manager.api.rpc('admin_manage_account',command(retained.id,'delete'))).error);assert.ifError((await service.from('provider_profiles').select('profile_id').eq('profile_id',retained.id).single()).error);
});
await check('Fresh account deletion requires confirmation, is idempotent, preserves ledger',async()=>{
 const fresh=await account();const preview=await manager.api.rpc('admin_account_preview',{target_user_id:fresh.id});assert.ifError(preview.error);assert.equal(preview.data.canDelete,true,JSON.stringify(preview.data.dependencies));
 const args=command(fresh.id,'delete');assert((await manager.api.rpc('admin_manage_account',{...args,confirmation:''})).error);
 assert.ifError((await manager.api.rpc('admin_manage_account',args)).error);
 assert.equal((await manager.api.rpc('admin_manage_account',args)).data.status,'pending');
 assert.ifError((await service.auth.admin.deleteUser(fresh.id)).error);
 const done=await service.rpc('finish_admin_account_deletion',{operation_id:args.operation_id});assert.ifError(done.error);assert.equal(done.data.status,'completed');
 assert((await service.auth.admin.getUserById(fresh.id)).error);assert.equal((await service.from('profiles').select('id').eq('id',fresh.id)).data.length,0);
 assert.equal((await manager.api.rpc('admin_manage_account',args)).data.status,'completed');
 assert((await client.api.rpc('finish_admin_account_deletion',{operation_id:args.operation_id})).error);
 assert.equal((await service.rpc('finish_admin_account_deletion',{operation_id:args.operation_id})).data.status,'completed');
 const audit=await service.from('audit_logs').select('id').eq('entity_id',fresh.id).eq('action','account.deleted');assert.ifError(audit.error);assert.equal(audit.data.length,1);
 accounts.splice(accounts.findIndex(a=>a.id===fresh.id),1);
});
}catch(error){results.push({name:'Lifecycle regression',status:'FAIL',message:error.message});console.log('FAIL '+error.message);process.exitCode=1;}
finally{for(const a of accounts.reverse()){const result=await service.auth.admin.deleteUser(a.id);if(result.error){console.log('Cleanup failed for own fixture');process.exitCode=1;}}await mkdir('work/account-lifecycle',{recursive:true});await writeFile('work/account-lifecycle/rpc-results.json',JSON.stringify(results,null,2));}
