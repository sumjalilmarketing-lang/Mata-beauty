import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co';
if(!production&&url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co')throw Error('Explicit isolated QA target required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const accounts=[],results=[];
async function check(name,run){await run();results.push({name,status:'PASS'});console.log('PASS '+name);}
function otp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return ((hash.readUInt32BE(hash[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function mfa(api){const e=await api.auth.mfa.enroll({factorType:'totp'});assert.ifError(e.error);const v=await api.auth.mfa.challengeAndVerify({factorId:e.data.id,code:otp(e.data.totp.secret)});assert.ifError(v.error);}
async function account(role){const email=`qa-team-${randomUUID()}@example.test`,password=`QA-${randomUUID()}!`;const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);const id=made.data.user.id,api=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options);accounts.push({id,api});await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',id);if(role){const r=await service.from('admin_roles').select('id').eq('key',role).single();assert.ifError(r.error);assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',id)).error);assert.ifError((await service.from('admin_user_roles').insert({user_id:id,role_id:r.data.id,requires_mfa:true})).error);}assert.ifError((await api.auth.signInWithPassword({email,password})).error);return{id,api,email,password};}
try{
const manager=await account('super_admin'),client=await account();
assert.ifError((await service.from('provider_profiles').insert({profile_id:client.id,business_name:'QA isolation owner',slug:`qa-owner-${randomUUID()}`,city:'Dakar',status:'draft'})).error);
await check('AAL1 Super Admin cannot list or invite',async()=>{assert((await manager.api.rpc('admin_list_team')).error);assert((await manager.api.rpc('admin_prepare_invitation',{target_email:'qa-denied@example.test',given_name:'QA',family_name:'Denied',target_role_key:'finance'})).error);});
await mfa(manager.api);
await check('AAL2 Super Admin can list team',async()=>assert.ifError((await manager.api.rpc('admin_list_team')).error));
for(const [role,allowed,denied] of [['finance','payments.read','support.manage'],['support','support.manage','payments.read'],['verification_agent','documents.review','payments.read'],['moderator','reports.manage','payments.read'],['content_manager','content.manage','documents.review'],['admin','users.read','roles.manage']]){
 const actor=await account(role);await mfa(actor.api);
 await check(`${role}: expected permissions, no team management or self-promotion`,async()=>{
  assert.equal((await actor.api.rpc('has_admin_permission',{required_permission:allowed})).data,true);
  assert.equal((await actor.api.rpc('has_admin_permission',{required_permission:denied})).data,false);
  assert((await actor.api.rpc('admin_list_team')).error);
  assert((await actor.api.rpc('admin_assign_role',{target_user_id:actor.id,target_role_key:'super_admin',reason:'QA escalation denial'})).error);
  assert((await actor.api.rpc('admin_set_user_suspension',{target_user_id:manager.id,suspended:true,reason:'QA legacy bypass denial'})).error);
  assert((await actor.api.rpc('activate_internal_invitation',{target_user_id:client.id})).error);
 });
 await check(`${role}: cannot archive another user's salon`,async()=>{
  const business=await service.from('businesses').insert({owner_id:client.id,name:'QA internal role isolation',slug:`qa-team-${randomUUID()}`,city:'Dakar',address:'Adresse fictive QA'}).select('id').single();assert.ifError(business.error);
  try{const attempted=await actor.api.rpc('archive_owned_business',{target_business_id:business.data.id});const observed=await service.from('businesses').select('is_active').eq('id',business.data.id).single();assert(attempted.error&&observed.data.is_active===true,'Unauthorized salon archive succeeded');}
  finally{await service.from('businesses').delete().eq('id',business.data.id);}
 });
}
await check('Client cannot read invitations or assign any internal role',async()=>{const rows=await client.api.from('internal_invitations').select('id');assert.equal(rows.data?.length,0);for(const role of ['finance','support','verification_agent','moderator','admin','super_admin'])assert((await client.api.rpc('admin_assign_role',{target_user_id:client.id,target_role_key:role,reason:'QA denial'})).error);});
const email=`qa-team-invite-${randomUUID()}@example.test`;
const prepared=await manager.api.rpc('admin_prepare_invitation',{target_email:email,given_name:'QA',family_name:'Finance',target_role_key:'finance'});assert.ifError(prepared.error);
await check('Duplicate invitation rejected',async()=>assert((await manager.api.rpc('admin_prepare_invitation',{target_email:email,given_name:'QA',family_name:'Finance',target_role_key:'finance'})).error));
const generated=await service.auth.admin.generateLink({type:'invite',email});assert.ifError(generated.error);
const member=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options),memberId=generated.data.user.id;accounts.push({id:memberId,api:member});
await service.auth.admin.updateUserById(memberId,{app_metadata:{qa_suppress_email:true}});
assert.ifError((await manager.api.rpc('admin_bind_invitation',{target_invitation_id:prepared.data,target_user_id:memberId})).error);
await check('Pending invite grants no role',async()=>{const rows=await service.from('admin_user_roles').select('role_id').eq('user_id',memberId);assert.equal(rows.data.length,0);});
assert.ifError((await member.auth.verifyOtp({token_hash:generated.data.properties.hashed_token,type:'invite'})).error);
const password=`QA-${randomUUID()}!`;assert.ifError((await member.auth.updateUser({password})).error);
await check('Expired invitation cannot activate a confirmed account',async()=>{assert.ifError((await service.from('internal_invitations').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('id',prepared.data)).error);assert((await service.rpc('activate_internal_invitation',{target_user_id:memberId})).error);assert.ifError((await service.from('internal_invitations').update({expires_at:new Date(Date.now()+3600000).toISOString()}).eq('id',prepared.data)).error);});
await check('Confirmed recipient activates once',async()=>{{const activated=await service.rpc('activate_internal_invitation',{target_user_id:memberId});assert.ifError(activated.error);assert.equal(activated.data,true);}{const activated=await service.rpc('activate_internal_invitation',{target_user_id:memberId});assert.ifError(activated.error);assert.equal(activated.data,true);}const roles=await service.from('admin_user_roles').select('role_id').eq('user_id',memberId);assert.equal(roles.data.length,1);});
await check('Activated Finance still denied before MFA',async()=>assert.equal((await member.rpc('has_admin_permission',{required_permission:'payments.read'})).data,false));
await mfa(member);
await check('MFA activation recorded without a secret',async()=>{const audit=await manager.api.from('audit_logs').select('before_data,after_data').eq('entity_id',memberId).eq('action','team.mfa_activated');assert.ifError(audit.error);assert.equal(audit.data.length,1);assert.deepEqual(audit.data[0].after_data,{verified:true});});
await check('Finance allowed, role management denied',async()=>{assert.equal((await member.rpc('has_admin_permission',{required_permission:'payments.read'})).data,true);assert((await member.rpc('admin_assign_role',{target_user_id:client.id,target_role_key:'super_admin',reason:'QA denial'})).error);});
await check('Finance to Support removes old permission from same session',async()=>{assert.ifError((await manager.api.rpc('admin_assign_role',{target_user_id:memberId,target_role_key:'support',reason:'QA role replacement'})).error);assert.equal((await member.rpc('has_admin_permission',{required_permission:'payments.read'})).data,false);assert.equal((await member.rpc('has_admin_permission',{required_permission:'support.manage'})).data,true);});
await check('Suspension rejects old session and new login',async()=>{assert.ifError((await manager.api.rpc('admin_change_internal_access',{target_user_id:memberId,target_action:'suspend',reason:'QA suspension'})).error);assert.equal((await member.rpc('has_admin_permission',{required_permission:'support.manage'})).data,false);assert((await member.auth.signInWithPassword({email,password})).error);});
await check('Reactivation restores login and keeps MFA',async()=>{assert.ifError((await manager.api.rpc('admin_change_internal_access',{target_user_id:memberId,target_action:'reactivate',reason:'QA reactivation'})).error);assert.ifError((await member.auth.signInWithPassword({email,password})).error);assert.equal((await member.rpc('has_admin_permission',{required_permission:'support.manage'})).data,false);});
await check('Revocation removes memberships and refuses reactivation shortcut',async()=>{assert.ifError((await manager.api.rpc('admin_change_internal_access',{target_user_id:memberId,target_action:'revoke',reason:'QA revocation'})).error);const roles=await service.from('admin_user_roles').select('role_id').eq('user_id',memberId).eq('is_active',true);assert.equal(roles.data.length,0);assert((await manager.api.rpc('admin_change_internal_access',{target_user_id:memberId,target_action:'reactivate',reason:'QA deny shortcut'})).error);});
await check('Self modification and NULL actions rejected',async()=>{assert((await manager.api.rpc('admin_assign_role',{target_user_id:manager.id,target_role_key:'support',reason:'QA self denial'})).error);assert((await manager.api.rpc('admin_change_internal_access',{target_user_id:memberId,target_action:null,reason:'QA NULL denial'})).error);});
await check('Audit retains role and lifecycle events',async()=>{const audit=await manager.api.from('audit_logs').select('action').eq('entity_id',memberId);assert.ifError(audit.error);for(const action of ['team.account_activated','admin.role_assigned','team.suspend','team.reactivate','team.revoke'])assert(audit.data.some(row=>row.action===action));await client.api.from('audit_logs').delete().eq('entity_id',memberId);const preserved=await manager.api.from('audit_logs').select('action').eq('entity_id',memberId);assert.equal(preserved.data.length,audit.data.length);});
}catch(error){results.push({name:'Execution',status:'FAIL',detail:error.message});process.exitCode=1;}
finally{for(const a of accounts.reverse()){await a.api.auth.signOut({scope:'global'});await service.from('internal_invitations').delete().eq('invited_by',a.id);const removed=await service.auth.admin.deleteUser(a.id);if(removed.error){results.push({name:'Fixture cleanup',status:'FAIL',detail:removed.error.message});process.exitCode=1;}}await mkdir('work/team-audit',{recursive:true});await writeFile(production?'work/team-audit/production-rpc-results.json':'work/team-audit/rpc-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}
