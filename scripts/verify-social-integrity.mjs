import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co';
assert(production||url==='https://kazlvtxkbsdhbfvtqqdp.supabase.co','Explicit QA target required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const accounts=[],postIds=[],results=[],storageObjects=[];
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
try{
 const owner=await account(),other=await account(),moderator=await account('moderator');
 const reference=await service.from('services').select('id').eq('is_active',true).limit(1).single();assert.ifError(reference.error);
 const services=[];
 for(const actor of [owner,other]){
  assert.ifError((await service.from('provider_profiles').insert({profile_id:actor.id,business_name:'QA integrity',slug:'qa-integrity-'+randomUUID(),city:'Dakar',status:'approved'})).error);
  const row=await service.from('provider_services').insert({provider_id:actor.id,service_id:reference.data.id,title:'QA integrity fixture',duration_minutes:60,price_amount:10000,is_active:true}).select('id').single();assert.ifError(row.error);services.push(row.data.id);
 }
 const documentPath=`${owner.id}/qa-${randomUUID()}.pdf`;
 assert.ifError((await owner.api.storage.from('provider-documents').upload(documentPath,Buffer.from('%PDF-1.4\nQA private fixture\n%%EOF'),{contentType:'application/pdf'})).error);
 storageObjects.push({bucket:'provider-documents',path:documentPath});
 await check('Document owner can sign own private KYC file',async()=>assert.ifError((await owner.api.storage.from('provider-documents').createSignedUrl(documentPath,30)).error));
 for(const [label,actor] of [['moderator',moderator],['finance',await account('finance')],['support',await account('support')]]) {
  await check(`${label} cannot sign another professional private KYC file`,async()=>assert((await actor.api.storage.from('provider-documents').createSignedUrl(documentPath,30)).error,'Cross-bucket private document access granted'));
 }
 const reviewer=await account('verification_agent');
 await check('Onboarding reviewer can sign private KYC file',async()=>assert.ifError((await reviewer.api.storage.from('provider-documents').createSignedUrl(documentPath,30)).error));
 for(let index=0;index<2;index++){
  const postId=randomUUID();postIds.push(postId);
  assert.ifError((await service.from('posts').insert({id:postId,author_id:owner.id,caption:'QA integrity synthetic',video_url:`${url}/storage/v1/object/public/provider-social-media/${owner.id}/${postId}/video.mp4`,duration_seconds:5,status:'draft',client_consent_confirmed:true})).error);
  assert.ifError((await service.from('post_services').insert({post_id:postId,provider_service_id:services[0],is_primary:true})).error);
  assert.ifError((await service.from('posts').update({status:'published',published_at:new Date().toISOString()}).eq('id',postId)).error);
 }
 // These are API integrity fixtures, not media playback tests. Remove the
 // provider from public discovery before adversarial mutations are attempted.
 assert.ifError((await service.from('provider_profiles').update({status:'draft'}).eq('profile_id',owner.id)).error);
 const postId=postIds[0];
 await check('Owner cannot relink a publication to another professional service',async()=>{
  await owner.api.from('post_services').update({provider_service_id:services[1]}).eq('post_id',postId);
  const actual=await service.from('post_services').select('provider_service_id').eq('post_id',postId).single();assert.ifError(actual.error);assert.equal(actual.data.provider_service_id,services[0]);
 });
 await service.from('post_services').update({provider_service_id:services[0]}).eq('post_id',postId);
 await check('Published primary service cannot be removed',async()=>{
  await owner.api.from('post_services').delete().eq('post_id',postId);
  const actual=await service.from('post_services').select('post_id').eq('post_id',postId);assert.ifError(actual.error);assert.equal(actual.data.length,1);
 });
 await service.from('post_services').upsert({post_id:postId,provider_service_id:services[0],is_primary:true});
 const created=await owner.api.from('post_comments').insert({post_id:postId,author_id:owner.id,body:'QA original'}).select('id').single();assert.ifError(created.error);const commentId=created.data.id;
 await check('Author can edit own comment body',async()=>{assert.ifError((await owner.api.from('post_comments').update({body:'QA amended'}).eq('id',commentId)).error);const row=await service.from('post_comments').select('body').eq('id',commentId).single();assert.equal(row.data.body,'QA amended');});
 await check('Author cannot move a comment to another publication',async()=>{await owner.api.from('post_comments').update({post_id:postIds[1]}).eq('id',commentId);const row=await service.from('post_comments').select('post_id').eq('id',commentId).single();assert.equal(row.data.post_id,postId);});
 await service.from('post_comments').update({post_id:postId}).eq('id',commentId);
 await check('Moderator cannot rewrite the author text',async()=>{await moderator.api.from('post_comments').update({body:'QA forged'}).eq('id',commentId);const row=await service.from('post_comments').select('body').eq('id',commentId).single();assert.equal(row.data.body,'QA amended');});
 await service.from('post_comments').update({body:'QA amended'}).eq('id',commentId);
 await check('Moderator can hide a comment',async()=>{assert.ifError((await moderator.api.from('post_comments').update({is_hidden:true}).eq('id',commentId)).error);const row=await service.from('post_comments').select('is_hidden').eq('id',commentId).single();assert.equal(row.data.is_hidden,true);});
 assert.ifError((await service.from('post_comments').update({is_hidden:true}).eq('id',commentId)).error);
 await check('Hidden comment is absent for an ordinary user',async()=>{const row=await other.api.from('post_comments').select('id').eq('id',commentId);assert.ifError(row.error);assert.equal(row.data.length,0);});
 await check('Moderator can read and restore a hidden comment',async()=>{const row=await moderator.api.from('post_comments').select('id').eq('id',commentId);assert.ifError(row.error);assert.equal(row.data.length,1);assert.ifError((await moderator.api.from('post_comments').update({is_hidden:false}).eq('id',commentId)).error);const restored=await service.from('post_comments').select('is_hidden').eq('id',commentId).single();assert.equal(restored.data.is_hidden,false);});
 await check('Hide and restore decisions have server audit events',async()=>{const audit=await service.from('audit_logs').select('action,actor_id').eq('entity_id',commentId);assert.ifError(audit.error);for(const action of ['comment.hidden','comment.restored'])assert(audit.data.some(row=>row.action===action&&row.actor_id===moderator.id));});
 if(process.env.INCLUDE_HEALTH_AUDIT==='1'){
  async function drafts(count){const rows=Array.from({length:count},()=>{const id=randomUUID();postIds.push(id);return{id,author_id:owner.id,caption:'QA health draft',video_url:`${url}/storage/v1/object/public/provider-social-media/${owner.id}/${id}/video.mp4`,duration_seconds:5,status:'draft'};});assert.ifError((await owner.api.from('posts').insert(rows)).error);}
  await drafts(18);
  await check('Abuse detector creates one high alert at threshold',async()=>{const r=await service.from('fraud_alerts').select('id,severity').eq('profile_id',owner.id);assert.ifError(r.error);assert.equal(r.data.length,1);assert.equal(r.data[0].severity,'high');});
  await drafts(20);
  const alerts=await service.from('fraud_alerts').select('id,severity').eq('profile_id',owner.id);assert.ifError(alerts.error);const alertId=alerts.data[0]?.id;
  await check('Existing alert escalates to critical without duplicates',async()=>{assert.equal(alerts.data.length,1);assert.equal(alerts.data[0].severity,'critical');});
  for(const actor of [owner,accounts.find(a=>a.role==='finance'),reviewer])await check(`${actor.role??'client'} cannot read fraud alerts`,async()=>{const r=await actor.api.from('fraud_alerts').select('id').eq('id',alertId);assert.ifError(r.error);assert.equal(r.data.length,0);});
  await check('Moderator can read the generated alert',async()=>{const r=await moderator.api.from('fraud_alerts').select('id,severity').eq('id',alertId);assert.ifError(r.error);assert.equal(r.data.length,1);assert.equal(r.data[0].severity,'critical');});
  await check('Moderator cannot forge an alert through Data API',async()=>assert((await moderator.api.from('fraud_alerts').insert({alert_type:'spam',profile_id:owner.id})).error));
  await check('Moderator cannot rewrite or delete detector evidence',async()=>{assert((await moderator.api.from('fraud_alerts').update({severity:'low'}).eq('id',alertId)).error);assert((await moderator.api.from('fraud_alerts').delete().eq('id',alertId)).error);const r=await service.from('fraud_alerts').select('severity').eq('id',alertId).single();assert.ifError(r.error);assert.equal(r.data.severity,'critical');});
 }
}catch(error){results.push({name:'Fixture setup',status:'FAIL',detail:error.message});}
finally{
 if(process.env.INCLUDE_HEALTH_AUDIT==='1'&&accounts.length)assert.ifError((await service.from('fraud_alerts').delete().in('profile_id',accounts.map(actor=>actor.id))).error);
 for(const object of storageObjects)assert.ifError((await service.storage.from(object.bucket).remove([object.path])).error);
 if(postIds.length)assert.ifError((await service.from('posts').delete().in('id',postIds)).error);
 for(const actor of accounts.reverse()){await actor.api.auth.signOut({scope:'global'});assert.ifError((await service.auth.admin.deleteUser(actor.id)).error);}
 await mkdir('work/permission-audit',{recursive:true});await writeFile(`work/permission-audit/social-integrity-${production?'production':'qa'}.json`,JSON.stringify(results,null,2));
 if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
}
