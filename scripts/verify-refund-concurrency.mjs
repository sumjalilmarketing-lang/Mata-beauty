import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co';
if(!production&&url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co')throw Error('Explicit isolated QA target required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const accounts=[],results=[];let serviceId,bookingId,paymentId;
async function check(name,run){try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}console.log(results.at(-1).status+' '+name);}
function otp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return ((hash.readUInt32BE(hash[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function mfa(api){const e=await api.auth.mfa.enroll({factorType:'totp'});assert.ifError(e.error);const v=await api.auth.mfa.challengeAndVerify({factorId:e.data.id,code:otp(e.data.totp.secret)});assert.ifError(v.error);}
async function account(role){const email=`qa-team-${randomUUID()}@example.test`,password=`QA-${randomUUID()}!`;const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);const id=made.data.user.id,api=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options);accounts.push({id,api});await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',id);if(role){const r=await service.from('admin_roles').select('id').eq('key',role).single();assert.ifError(r.error);assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',id)).error);assert.ifError((await service.from('admin_user_roles').insert({user_id:id,role_id:r.data.id,requires_mfa:true})).error);}assert.ifError((await api.auth.signInWithPassword({email,password})).error);return{id,api,email,password};}

assert(!production,'Refund concurrency reproduction is isolated to QA');
try{
 const client=await account(),provider=await account(),finance=await account('finance'),outsider=await account();await mfa(finance.api);assert.ifError((await client.api.rpc('ensure_authenticated_profile')).error);assert.ifError((await service.from('profiles').update({account_status:'active'}).eq('id',client.id)).error);
 assert.ifError((await service.from('provider_profiles').insert({profile_id:provider.id,business_name:'QA refund concurrency',slug:'qa-refund-'+randomUUID(),city:'Dakar',status:'approved'})).error);
 const ref=await service.from('services').select('id').eq('is_active',true).limit(1).single();assert.ifError(ref.error);
 const ps=await service.from('provider_services').insert({provider_id:provider.id,service_id:ref.data.id,title:'QA refund',duration_minutes:60,price_amount:10000,is_active:true}).select('id').single();assert.ifError(ps.error);serviceId=ps.data.id;
 const start=new Date(Date.now()+8*86400000);start.setUTCHours(10,0,0,0);
 assert.ifError((await service.from('availability_rules').insert({provider_id:provider.id,weekday:start.getUTCDay(),starts_at:'08:00',ends_at:'18:00',slot_interval_minutes:30})).error);
 const b=await client.api.from('bookings').insert({client_id:client.id,provider_id:provider.id,provider_service_id:serviceId,starts_at:start.toISOString(),ends_at:new Date(start.getTime()+3600000).toISOString(),status:'pending',location_mode:'salon',total_amount:10000,currency:'XOF'}).select('id').single();assert.ifError(b.error);bookingId=b.data.id;
 const p=await service.from('payments').insert({booking_id:bookingId,customer_id:client.id,professional_id:provider.id,payment_method:'wave',payment_status:'paid',amount:10000,gross_amount:10000,platform_fee:1000,provider_fee:0,professional_net_amount:9000,currency:'XOF',provider:'mock',is_test:true,idempotency_key:'QA-'+randomUUID()}).select('id').single();assert.ifError(p.error);paymentId=p.data.id;
 const payload={target_payment_id:paymentId,target_amount:6000,target_reason:'QA concurrent refund request',target_source_ip_hash:'qa'};
 const attempts=[randomUUID(),randomUUID()];
 const concurrent=await Promise.all(attempts.map(target_attempt=>client.api.rpc('request_payment_refund_v2',{...payload,target_attempt})));
 await check('Two concurrent requests cannot reserve more than paid amount',async()=>{assert.equal(concurrent.filter(r=>!r.error).length,1,JSON.stringify(concurrent.map(r=>r.error?.message??'accepted')));const r=await service.from('refunds').select('amount').eq('payment_id',paymentId);assert.ifError(r.error);assert(r.data.reduce((sum,row)=>sum+row.amount,0)<=10000);});
 const successful=concurrent.findIndex(r=>!r.error),refundId=concurrent[successful]?.data?.id;assert(refundId);
 await check('Retry returns original request without duplicate',async()=>{const r=await client.api.rpc('request_payment_refund_v2',{...payload,target_attempt:attempts[successful]});assert.ifError(r.error);assert.equal(r.data.id,refundId);assert.equal(r.data.idempotent,true);});
 await check('Unrelated client cannot request a refund',async()=>assert((await outsider.api.rpc('request_payment_refund_v2',{...payload,target_attempt:randomUUID()})).error));
 await check('Client cannot approve own refund',async()=>assert((await client.api.rpc('manage_refund_request',{target_refund_id:refundId,target_action:'approve',target_reason:'QA forbidden approval'})).error));
 await check('Finance can reject a request',async()=>assert.ifError((await finance.api.rpc('manage_refund_request',{target_refund_id:refundId,target_action:'reject',target_reason:'QA release reservation'})).error));
 await check('Rejected amount becomes available to a new request',async()=>{const r=await client.api.rpc('request_payment_refund_v2',{...payload,target_amount:10000,target_attempt:randomUUID()});assert.ifError(r.error);assert.equal(r.data.amount,10000);});
} catch(error){results.push({name:'Fixture setup',status:'FAIL',error:error.message});}
finally {
 if(bookingId)assert.ifError((await service.from('appointment_reminder_jobs').delete().eq('booking_id',bookingId)).error);
 // Financial audit is immutable. Revoke and ban synthetic accounts instead of weakening it.
 for(const actor of accounts){await actor.api.auth.signOut({scope:'global'});assert.ifError((await service.auth.admin.updateUserById(actor.id,{ban_duration:'876000h'})).error);assert.ifError((await service.from('admin_user_roles').update({is_active:false,revoked_at:new Date().toISOString()}).eq('user_id',actor.id)).error);assert.ifError((await service.from('profiles').update({is_suspended:true}).eq('id',actor.id)).error);}
 await writeFile('work/permission-audit/refund-concurrency-qa.json',JSON.stringify({date:new Date().toISOString(),results,retainedAuditActors:accounts.map(a=>a.id)},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}




