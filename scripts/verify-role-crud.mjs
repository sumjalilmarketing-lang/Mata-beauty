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
async function check(role,api,action,allowed,run){try{await run();results.push({role,api,action,expected:allowed?'ALLOWED':'DENIED',status:'PASS'});}catch(error){results.push({role,api,action,expected:allowed?'ALLOWED':'DENIED',status:'FAIL',detail:error.message});}console.log(results.at(-1).status+' '+role+' '+api+' '+action);}
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


const run=randomUUID(),categoryIds=[],settingKey='qa_matrix_'+run;
let ticketId,reportId;
try {
 const target=await account(),provider=await account();
 assert.ifError((await service.from('provider_profiles').insert({profile_id:provider.id,business_name:'QA matrix private',slug:'qa-matrix-'+run,city:'Dakar',status:'draft'})).error);
 const ticket=await service.from('support_tickets').insert({requester_id:target.id,subject:'QA matrix '+run,category:'other',status:'open',priority:'normal'}).select('id').single();assert.ifError(ticket.error);ticketId=ticket.data.id;
 const report=await service.from('reports').insert({reporter_id:target.id,reported_profile_id:provider.id,reason:'autre',details:'QA isolated permissions'}).select('id').single();assert.ifError(report.error);reportId=report.data.id;
 assert.ifError((await service.from('app_settings').insert({key:settingKey,value:{qa:true},is_sensitive:true})).error);
 for(const role of ['client','professional','admin','support','finance','verification_agent','moderator','content_manager','super_admin']){
  const actor=await account(['client','professional'].includes(role)?null:role),api=actor.api;
  if(role==='professional'){assert.ifError((await service.from('provider_profiles').insert({profile_id:actor.id,business_name:'QA matrix professional',slug:'qa-matrix-'+randomUUID(),city:'Dakar',status:'draft'})).error);assert.ifError((await service.from('profiles').update({role:'provider'}).eq('id',actor.id)).error);}
  const categoryAllowed=['admin','content_manager','super_admin'].includes(role),supportAllowed=['admin','support','super_admin'].includes(role),moderationAllowed=['admin','moderator','super_admin'].includes(role),suspendAllowed=['admin','super_admin'].includes(role);
  const cid=randomUUID();categoryIds.push(cid);assert.ifError((await service.from('categories').insert({id:cid,name:'QA matrix category',slug:'qa-'+cid,is_active:false})).error);
  await check(role,'admin_manage_category','CREATE',categoryAllowed,async()=>{const r=await api.rpc('admin_manage_category',{target_action:'create',target_name:'QA created',target_slug:'qa-'+randomUUID(),target_is_active:false});if(categoryAllowed){assert.ifError(r.error);categoryIds.push(r.data);assert.equal((await service.from('categories').select('is_active').eq('id',r.data).single()).data.is_active,false);}else assert(r.error);});
  await check(role,'admin_manage_category','UPDATE',categoryAllowed,async()=>{const r=await api.rpc('admin_manage_category',{target_action:'update',target_category_id:cid,target_name:'QA changed',target_slug:'qa-'+cid,target_is_active:false});if(categoryAllowed)assert.ifError(r.error);else assert(r.error);const actual=await service.from('categories').select('name').eq('id',cid).single();assert.ifError(actual.error);assert.equal(actual.data.name,categoryAllowed?'QA changed':'QA matrix category');});
  await check(role,'admin_manage_category','DELETE',categoryAllowed,async()=>{const r=await api.rpc('admin_manage_category',{target_action:'delete',target_category_id:cid});if(categoryAllowed)assert.ifError(r.error);else assert(r.error);const actual=await service.from('categories').select('id').eq('id',cid);assert.ifError(actual.error);assert.equal(actual.data.length,categoryAllowed?0:1);});
  await check(role,'support_tickets','READ',supportAllowed,async()=>{const r=await api.from('support_tickets').select('id').eq('id',ticketId);assert.ifError(r.error);assert.equal(r.data.length,supportAllowed?1:0);});
  await check(role,'manage_support_ticket','UPDATE',supportAllowed,async()=>{const r=await api.rpc('manage_support_ticket',{target_ticket_id:ticketId,target_action:'priority',target_value:'high'});if(supportAllowed)assert.ifError(r.error);else assert(r.error);const actual=await service.from('support_tickets').select('priority').eq('id',ticketId).single();assert.equal(actual.data.priority,supportAllowed?'high':'normal');});
  assert.ifError((await service.from('support_tickets').update({priority:'normal'}).eq('id',ticketId)).error);
  await check(role,'reports','READ',moderationAllowed,async()=>{const r=await api.from('reports').select('id').eq('id',reportId);assert.ifError(r.error);assert.equal(r.data.length,moderationAllowed?1:0);});
  await check(role,'manage_moderation_report','UPDATE',moderationAllowed,async()=>{const r=await api.rpc('manage_moderation_report',{target_report_id:reportId,target_action:'examine',target_reason:'QA matrix decision'});if(moderationAllowed)assert.ifError(r.error);else assert(r.error);const actual=await service.from('reports').select('status').eq('id',reportId).single();assert.equal(actual.data.status,moderationAllowed?'reviewing':'open');});
  assert.ifError((await service.from('reports').update({status:'open',assigned_to:null}).eq('id',reportId)).error);
  await check(role,'admin_set_user_suspension','SENSITIVE',suspendAllowed,async()=>{const r=await api.rpc('admin_set_user_suspension',{target_user_id:target.id,suspended:true,reason:'QA temporary boundary check'});if(suspendAllowed)assert.ifError(r.error);else assert(r.error);assert.equal((await service.from('profiles').select('is_suspended').eq('id',target.id).single()).data.is_suspended,suspendAllowed);});
  assert.ifError((await service.from('profiles').update({is_suspended:false}).eq('id',target.id)).error);
  await check(role,'admin_set_provider_status','SENSITIVE',suspendAllowed,async()=>{const r=await api.rpc('admin_set_provider_status',{target_provider_id:provider.id,next_status:'suspended',reason:'QA temporary boundary check'});if(suspendAllowed)assert.ifError(r.error);else assert(r.error);assert.equal((await service.from('provider_profiles').select('status').eq('profile_id',provider.id).single()).data.status,suspendAllowed?'suspended':'draft');});
  assert.ifError((await service.from('provider_profiles').update({status:'draft'}).eq('profile_id',provider.id)).error);
  const settingsRead=['admin','content_manager','super_admin'].includes(role),settingsWrite=role==='super_admin';
  await check(role,'app_settings sensitive fixture','READ',settingsRead,async()=>{const r=await api.from('app_settings').select('key').eq('key',settingKey);assert.ifError(r.error);assert.equal(r.data.length,settingsRead?1:0);});
  await check(role,'admin_update_setting','UPDATE',settingsWrite,async()=>{const r=await api.rpc('admin_update_setting',{setting_key:settingKey,setting_value:{qa:'changed'},reason:'QA isolated setting'});if(settingsWrite)assert.ifError(r.error);else assert(r.error);assert.deepEqual((await service.from('app_settings').select('value').eq('key',settingKey).single()).data.value,settingsWrite?{qa:'changed'}:{qa:true});});
  assert.ifError((await service.from('app_settings').update({value:{qa:true}}).eq('key',settingKey)).error);
  await check(role,'admin_roles','READ',role==='super_admin',async()=>{const r=await api.from('admin_roles').select('id');assert.ifError(r.error);assert.equal(r.data.length>0,role==='super_admin');});
  await check(role,'admin_user_roles','CREATE',false,async()=>{const roleRow=await service.from('admin_roles').select('id').eq('key','super_admin').single();assert.ifError(roleRow.error);const r=await api.from('admin_user_roles').insert({user_id:target.id,role_id:roleRow.data.id,requires_mfa:false});assert(r.error);const actual=await service.from('admin_user_roles').select('user_id').eq('user_id',target.id);assert.ifError(actual.error);assert.equal(actual.data.length,0);});
  await check(role,'provider_profiles foreign draft','READ',['admin','verification_agent','moderator','content_manager','super_admin'].includes(role),async()=>{const r=await api.from('provider_profiles').select('profile_id').eq('profile_id',provider.id);assert.ifError(r.error);assert.equal(r.data.length,['admin','verification_agent','moderator','content_manager','super_admin'].includes(role)?1:0);});
 }
} catch(error){results.push({api:'Fixture preparation',status:'FAIL',detail:error.message});}
finally {
 if(ticketId)assert.ifError((await service.from('support_tickets').delete().eq('id',ticketId)).error);
 if(reportId)assert.ifError((await service.from('reports').delete().eq('id',reportId)).error);
 if(categoryIds.length)assert.ifError((await service.from('categories').delete().in('id',categoryIds)).error);
 assert.ifError((await service.from('app_settings').delete().eq('key',settingKey)).error);
 for(const actor of accounts.reverse()){await actor.api.auth.signOut({scope:'global'});assert.ifError((await service.auth.admin.deleteUser(actor.id)).error);}
 await mkdir('work/permission-audit',{recursive:true});await writeFile(`work/permission-audit/role-crud-${production?'production':'qa'}.json`,JSON.stringify({date:new Date().toISOString(),results},null,2));
 if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
}


