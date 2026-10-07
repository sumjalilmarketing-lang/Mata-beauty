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

let bookingId;
try {
 const owner=await account(),other=await account(),superAdmin=await account('super_admin');
 const anon=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options);
 for(const actor of [owner,other])assert.ifError((await service.from('provider_profiles').insert({profile_id:actor.id,business_name:'QA launch boundary',slug:'qa-launch-'+randomUUID(),city:'Dakar',status:'draft'})).error);
 assert.ifError((await service.from('provider_profiles').update({status:'approved'}).eq('profile_id',other.id)).error);
 assert.ifError((await service.from('profiles').update({role:'provider'}).eq('id',other.id)).error);
 assert.ifError((await service.from('account_roles').upsert({profile_id:other.id,role:'professional'})).error);
 await check('Super Admin CREATE cohort through API',async()=>assert.ifError((await superAdmin.api.from('launch_provider_cohort').insert({provider_id:owner.id,added_by:superAdmin.id,internal_note:'QA private note'})).error));
 await check('Super Admin READ dashboard and private cohort',async()=>{const d=await superAdmin.api.rpc('get_launch_dashboard');assert.ifError(d.error);assert.equal(typeof d.data.users,'number');const r=await superAdmin.api.rpc('get_launch_provider_cohort');assert.ifError(r.error);assert(r.data.some(row=>row.provider_id===owner.id&&row.internal_note==='QA private note'));});
 await check('Super Admin UPDATE cohort and eligibility badge',async()=>{assert.ifError((await superAdmin.api.from('launch_provider_cohort').update({is_founder:true}).eq('provider_id',owner.id)).error);const r=await superAdmin.api.rpc('sync_founder_badge',{target_provider_id:owner.id});assert.ifError(r.error);assert.equal(r.data,false);});
 for(const [label,actor] of [['anonymous',{api:anon,id:other.id}],['client',owner],['professional',other],...await Promise.all(['support','finance','verification_agent','moderator','admin','content_manager'].map(async role=>[role,await account(role)]))]){
  await check(`${label}: READ cohort and settings denied`,async()=>{for(const table of ['launch_provider_cohort','launch_settings']){const r=await actor.api.from(table).select('*');assert(r.error||r.data.length===0,table);}});
  await check(`${label}: CREATE cohort denied`,async()=>assert((await actor.api.from('launch_provider_cohort').insert({provider_id:other.id,added_by:actor.id})).error));
  await check(`${label}: UPDATE and DELETE cohort denied`,async()=>{await actor.api.from('launch_provider_cohort').update({internal_note:'forged'}).eq('provider_id',owner.id);await actor.api.from('launch_provider_cohort').delete().eq('provider_id',owner.id);const r=await service.from('launch_provider_cohort').select('internal_note').eq('provider_id',owner.id).single();assert.ifError(r.error);assert.equal(r.data.internal_note,'QA private note');});
  await check(`${label}: sensitive launch RPCs denied`,async()=>{for(const [name,args] of [['get_launch_dashboard',{}],['get_launch_provider_cohort',{}],['sync_founder_badge',{target_provider_id:owner.id}],['process_internal_booking_reminders',{}]])assert((await actor.api.rpc(name,args)).error,name);});
 }
 await check('Professional cannot self-assign founder badge',async()=>{assert((await other.api.from('provider_profiles').update({founder_badge_enabled:true}).eq('profile_id',other.id)).error);});
 await check('Super Admin DELETE cohort through API',async()=>{assert.ifError((await superAdmin.api.from('launch_provider_cohort').delete().eq('provider_id',owner.id)).error);assert.equal((await service.from('launch_provider_cohort').select('provider_id').eq('provider_id',owner.id)).data.length,0);});
 const ref=await service.from('services').select('id').eq('is_active',true).limit(1).single();assert.ifError(ref.error);
 assert.ifError((await service.from('provider_profiles').update({status:'approved'}).eq('profile_id',owner.id)).error);
 const ps=await service.from('provider_services').insert({provider_id:owner.id,service_id:ref.data.id,title:'QA reminder',duration_minutes:60,price_amount:10000,is_active:true}).select('id').single();assert.ifError(ps.error);
 const start=new Date(Date.now()+7*86400000);start.setUTCHours(10,0,0,0);
 assert.ifError((await service.from('availability_rules').insert({provider_id:owner.id,weekday:start.getUTCDay(),starts_at:'08:00',ends_at:'18:00',slot_interval_minutes:30})).error);
 const booking=await other.api.from('bookings').insert({client_id:other.id,provider_id:owner.id,provider_service_id:ps.data.id,starts_at:start.toISOString(),ends_at:new Date(start.getTime()+3600000).toISOString(),status:'pending',location_mode:'salon',total_amount:10000,currency:'XOF'}).select('id').single();assert.ifError(booking.error);bookingId=booking.data.id;
 await check('Booking creates exactly two scheduled reminder jobs',async()=>{const r=await other.api.from('appointment_reminder_jobs').select('offset_hours,status').eq('booking_id',bookingId);assert.ifError(r.error);assert.equal(r.data.length,2);assert(r.data.every(row=>row.status==='pending'));});
 await check('Client cannot create or alter reminder jobs',async()=>{assert((await other.api.from('appointment_reminder_jobs').insert({booking_id:bookingId,offset_hours:2,due_at:new Date().toISOString()})).error);assert((await other.api.from('appointment_reminder_jobs').update({status:'sent'}).eq('booking_id',bookingId)).error);});
 assert.ifError((await service.from('appointment_reminder_jobs').update({status:'sent',sent_at:new Date().toISOString()}).eq('booking_id',bookingId).eq('offset_hours',24)).error);
 assert.ifError((await owner.api.from('bookings').update({status:'confirmed'}).eq('id',bookingId)).error);
 await check('Confirmation does not requeue an already sent reminder',async()=>{const r=await service.from('appointment_reminder_jobs').select('status').eq('booking_id',bookingId).eq('offset_hours',24).single();assert.ifError(r.error);assert.equal(r.data.status,'sent');});
 if(!production){
  assert.ifError((await service.from('appointment_reminder_jobs').update({due_at:new Date(Date.now()-60000).toISOString()}).eq('booking_id',bookingId).eq('offset_hours',2)).error);
  await check('Due reminder creates one notification per recipient without duplicates',async()=>{
   assert.ifError((await service.rpc('process_internal_booking_reminders')).error);assert.ifError((await service.rpc('process_internal_booking_reminders')).error);
   const r=await service.from('notifications').select('profile_id').eq('kind','appointment_reminder').contains('data',{booking_id:bookingId,offset_hours:2});assert.ifError(r.error);assert.equal(r.data.length,2);assert.deepEqual(new Set(r.data.map(row=>row.profile_id)),new Set([owner.id,other.id]));
  });
 }
 assert.ifError((await other.api.from('bookings').update({status:'cancelled_by_client'}).eq('id',bookingId)).error);
 await check('Cancelled booking has no pending reminders',async()=>{const r=await service.from('appointment_reminder_jobs').select('id').eq('booking_id',bookingId).eq('status','pending');assert.ifError(r.error);assert.equal(r.data.length,0);});
}catch(error){results.push({name:'Fixture setup',status:'FAIL',detail:error.message});process.exitCode=1;}
finally {
 if(accounts.length)assert.ifError((await service.from('launch_provider_cohort').delete().in('provider_id',accounts.map(a=>a.id))).error);
 if(bookingId)assert.ifError((await service.from('bookings').delete().eq('id',bookingId)).error);
 for(const actor of accounts.reverse()){await actor.api.auth.signOut({scope:'global'});assert.ifError((await service.auth.admin.deleteUser(actor.id)).error);}
 await mkdir('work/permission-audit',{recursive:true});await writeFile(`work/permission-audit/launch-boundaries-${production?'production':'qa'}.json`,JSON.stringify(results,null,2));
 if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
}

