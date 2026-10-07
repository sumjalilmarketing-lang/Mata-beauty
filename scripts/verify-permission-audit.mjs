import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.env.REMOTE_SUPABASE_URL;
const production=process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com'&&url==='https://qjdwxdbvrxedyfolnpol.supabase.co';
if(!production&&url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co')throw Error('Explicit isolated QA target required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const accounts=[],results=[];let serviceId,bookingId,paymentId,ticketId,documentPath;
async function check(name,run){try{await run();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}console.log(results.at(-1).status+' '+name);}
function otp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=/g,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return ((hash.readUInt32BE(hash[19]&15)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function mfa(api){const e=await api.auth.mfa.enroll({factorType:'totp'});assert.ifError(e.error);const v=await api.auth.mfa.challengeAndVerify({factorId:e.data.id,code:otp(e.data.totp.secret)});assert.ifError(v.error);}
async function account(role){const email=`qa-team-${randomUUID()}@example.test`,password=`QA-${randomUUID()}!`;const made=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);const id=made.data.user.id,api=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options);accounts.push({id,api});await service.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',id);if(role){const r=await service.from('admin_roles').select('id').eq('key',role).single();assert.ifError(r.error);assert.ifError((await service.from('profiles').update({role:'admin'}).eq('id',id)).error);assert.ifError((await service.from('admin_user_roles').insert({user_id:id,role_id:r.data.id,requires_mfa:true})).error);}assert.ifError((await api.auth.signInWithPassword({email,password})).error);return{id,api,email,password};}

try{
 const client=await account(),provider=await account(),stranger=await account(),staff=await account('support');await mfa(staff.api);
 const anon=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,options);
 assert.ifError((await service.from('provider_profiles').insert({profile_id:provider.id,business_name:'Permission QA',slug:'permission-'+randomUUID(),city:'Dakar',status:'draft'})).error);
 await check('Document without an actual private upload denied',async()=>assert((await provider.api.from('provider_documents').insert({provider_id:provider.id,kind:'identity',storage_path:provider.id+'/missing.pdf',status:'approved',reviewed_by:provider.id})).error));
 documentPath=provider.id+'/permission-'+randomUUID()+'.pdf';
 assert.ifError((await provider.api.storage.from('provider-documents').upload(documentPath,Buffer.from('%PDF-1.4\n% Synthetic QA document\n%%EOF'),{contentType:'application/pdf'})).error);
 await check('Document insert cannot self-approve',async()=>{const d=await provider.api.from('provider_documents').insert({provider_id:provider.id,kind:'identity',storage_path:documentPath,status:'approved',reviewed_by:provider.id,reviewed_at:new Date().toISOString()}).select('status,reviewed_by,reviewed_at').single();assert.ifError(d.error);assert.deepEqual(d.data,{status:'pending',reviewed_by:null,reviewed_at:null});});
 await check('Document owner cannot alter review decision',async()=>assert((await provider.api.from('provider_documents').update({status:'approved',reviewed_by:provider.id}).eq('provider_id',provider.id)).error));
 for(const [role,api] of [['anon',anon],['client',client.api],['support',staff.api]]){
  for(const [name,args] of [
   ['write_admin_audit',{audit_action:'team.role_changed',resource_type:'profiles',resource_id:client.id,previous_value:{},next_value:{role:'super_admin'},justification:'QA fabricated event'}],
   ['compute_provider_launch_completeness',{target_provider_id:provider.id}],
   ['attach_payment_provider',{target_payment_id:randomUUID(),target_provider:'wave',target_provider_reference:'forged',target_is_test:false}],
   ['initialize_payment',{target_booking_id:randomUUID(),target_method:'wave',target_attempt:randomUUID(),target_provider_reference:'forged'}],
   ['manage_provider_onboarding',{target_provider_id:provider.id,target_action:'approve',target_reason:'QA legacy approval'}],
   ['complete_provider_onboarding_information',{target_note:'QA legacy submission'}],
   ['request_payment_refund',{target_payment_id:randomUUID(),target_amount:100,target_reason:'QA legacy refund'}],
   ['attach_payment_provider_server',{target_payment_id:randomUUID(),target_customer_id:client.id,target_provider:'mock',target_provider_reference:'forged',target_is_test:true}]
  ])await check(role+' cannot directly call '+name,async()=>{const result=await api.rpc(name,args);const absentLegacy=['manage_provider_onboarding','complete_provider_onboarding_information','request_payment_refund'].includes(name)&&result.error?.code==='PGRST202';assert(result.error?.code==='42501'||absentLegacy,JSON.stringify(result.error));});
 }
 await check('Provider checklist still works through authorized wrapper',async()=>{const r=await provider.api.rpc('get_provider_launch_checklist',{target_provider_id:provider.id});assert.ifError(r.error);assert.equal(typeof r.data.score,'number');});
 await check('Foreign checklist denied',async()=>assert((await client.api.rpc('get_provider_launch_checklist',{target_provider_id:provider.id})).error));
 const ticket=await client.api.from('support_tickets').insert({requester_id:client.id,subject:'QA internal note isolation'}).select('id').single();assert.ifError(ticket.error);ticketId=ticket.data.id;
 await check('Support action retains internal audit writer',async()=>{const r=await staff.api.rpc('manage_support_ticket',{target_ticket_id:ticketId,target_action:'reply',target_value:null,target_message:'QA public reply'});assert.ifError(r.error);const audit=await service.from('audit_logs').select('id').eq('entity_id',ticketId);assert.ifError(audit.error);assert(audit.data.length>0);});
 await check('Support can create and read internal note',async()=>{assert.ifError((await staff.api.from('support_messages').insert({ticket_id:ticketId,sender_id:staff.id,body:'QA private note',is_internal:true})).error);const r=await staff.api.from('support_messages').select('id').eq('ticket_id',ticketId).eq('is_internal',true);assert.ifError(r.error);assert.equal(r.data.length,1);});
 await check('Client sees public reply but not internal note',async()=>{const r=await client.api.from('support_messages').select('body,is_internal').eq('ticket_id',ticketId);assert.ifError(r.error);assert.equal(r.data.length,1);assert.equal(r.data[0].is_internal,false);});
 await check('Client cannot mark own reply internal',async()=>assert((await client.api.from('support_messages').insert({ticket_id:ticketId,sender_id:client.id,body:'QA fake internal',is_internal:true})).error));
 await check('Unrelated client cannot read ticket messages',async()=>{const r=await stranger.api.from('support_messages').select('id').eq('ticket_id',ticketId);assert.ifError(r.error);assert.equal(r.data.length,0);});
 assert.ifError((await service.from('provider_profiles').update({status:'approved'}).eq('profile_id',provider.id)).error);
 const reference=await service.from('services').select('id').eq('is_active',true).limit(1).single();assert.ifError(reference.error);
 const ps=await service.from('provider_services').insert({provider_id:provider.id,service_id:reference.data.id,title:'QA permission booking',duration_minutes:60,price_amount:15000,currency:'XOF',is_active:true}).select('id').single();assert.ifError(ps.error);serviceId=ps.data.id;
 const start=new Date(Date.now()+5*86400000);start.setUTCHours(10,0,0,0);
 assert.ifError((await service.from('availability_rules').insert({provider_id:provider.id,weekday:start.getUTCDay(),starts_at:'08:00',ends_at:'18:00',slot_interval_minutes:30})).error);
 const b=await client.api.from('bookings').insert({client_id:client.id,provider_id:provider.id,provider_service_id:serviceId,starts_at:start.toISOString(),ends_at:new Date(start.getTime()+3600000).toISOString(),status:'pending',location_mode:'salon',total_amount:15000,currency:'XOF'}).select('id').single();assert.ifError(b.error);bookingId=b.data.id;
 const p=await service.from('payments').insert({booking_id:bookingId,customer_id:client.id,professional_id:provider.id,payment_method:'wave',payment_status:'pending',amount:15000,gross_amount:15000,platform_fee:1500,provider_fee:0,professional_net_amount:13500,currency:'XOF',provider:'mock',is_test:true,idempotency_key:'QA-'+randomUUID()}).select('id').single();assert.ifError(p.error);paymentId=p.data.id;
 const attach={target_payment_id:paymentId,target_customer_id:client.id,target_provider:'mock',target_provider_reference:'mock_QA_'+randomUUID(),target_is_test:true};
 await check('Server refuses wrong payment owner',async()=>assert((await service.rpc('attach_payment_provider_server',{...attach,target_customer_id:stranger.id})).error));
 await check('Server refuses live payment flag',async()=>assert((await service.rpc('attach_payment_provider_server',{...attach,target_is_test:false})).error));
 await check('Server attaches mock payment for verified owner',async()=>{assert.ifError((await service.rpc('attach_payment_provider_server',attach)).error);const r=await service.from('payments').select('is_test,provider,provider_reference').eq('id',paymentId).single();assert.ifError(r.error);assert.deepEqual(r.data,{is_test:true,provider:'mock',provider_reference:attach.target_provider_reference});});
 await check('Server refuses replacing attached reference',async()=>assert((await service.rpc('attach_payment_provider_server',{...attach,target_provider_reference:'replacement'})).error));
 for(const status of ['confirmed','in_progress','completed'])assert.ifError((await provider.api.from('bookings').update({status}).eq('id',bookingId)).error);
 await check('Review cannot target a different professional',async()=>assert((await client.api.from('reviews').insert({booking_id:bookingId,client_id:client.id,provider_id:stranger.id,rating:1,comment:'QA wrong provider'})).error));
 const review=await client.api.from('reviews').insert({booking_id:bookingId,client_id:client.id,provider_id:provider.id,rating:4,comment:'QA valid review'}).select('id').single();assert.ifError(review.error);
 await check('Professional cannot rewrite client rating',async()=>assert((await provider.api.from('reviews').update({rating:5,comment:'Forged'}).eq('id',review.data.id)).error));
 await check('Client cannot forge professional reply',async()=>assert((await client.api.from('reviews').update({provider_reply:'Forged'}).eq('id',review.data.id)).error));
 await check('Client cannot moderate visibility',async()=>assert((await client.api.from('reviews').update({is_visible:false}).eq('id',review.data.id)).error));
 await check('Professional can reply without rewriting review',async()=>{assert.ifError((await provider.api.from('reviews').update({provider_reply:'QA legitimate reply'}).eq('id',review.data.id)).error);const r=await client.api.from('reviews').select('rating,comment,provider_reply').eq('id',review.data.id).single();assert.ifError(r.error);assert.deepEqual(r.data,{rating:4,comment:'QA valid review',provider_reply:'QA legitimate reply'});});
 await check('Client can amend own comment',async()=>{assert.ifError((await client.api.from('reviews').update({comment:'QA amended review'}).eq('id',review.data.id)).error);const r=await provider.api.from('reviews').select('comment').eq('id',review.data.id).single();assert.ifError(r.error);assert.equal(r.data.comment,'QA amended review');});
}finally{
 if(documentPath)assert.ifError((await service.storage.from('provider-documents').remove([documentPath])).error);
 if(bookingId)assert.ifError((await service.from('reviews').delete().eq('booking_id',bookingId)).error);
 for(const [table,id] of [['support_tickets',ticketId],['payments',paymentId],['bookings',bookingId],['provider_services',serviceId]])if(id)assert.ifError((await service.from(table).delete().eq('id',id)).error);
 for(const a of accounts.reverse()){await a.api.auth.signOut({scope:'global'});assert.ifError((await service.auth.admin.deleteUser(a.id)).error);}
 await mkdir('work/permission-audit',{recursive:true});await writeFile(process.env.PERMISSION_OUTPUT??'work/permission-audit/verification.json',JSON.stringify({date:new Date().toISOString(),backend:url,results},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
