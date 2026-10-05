import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url=process.env.REMOTE_SUPABASE_URL;
if(url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co') throw new Error('QA only');
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const clients=[],users=[];
const password=`QA-${randomUUID()}!`;
try {
  for(let i=0;i<2;i++) {
    const email=`codex-notifications-${randomUUID()}@example.test`;
    const created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'Notifications QA',legal_accepted:true}});
    assert.equal(created.error,null);users.push(created.data.user.id);
    const client=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
    assert.equal((await client.auth.signInWithPassword({email,password})).error,null);
    assert.equal((await client.rpc('synchronize_account_status')).error,null);clients.push(client);
  }
  const inserted=await service.from('notifications').insert({profile_id:users[0],kind:'professional_application',title:'Dossier reçu QA',body:'Événement synthétique de recette',data:{status:'submitted'}}).select('id,data').single();
  assert.equal(inserted.error,null);const id=inserted.data.id;
  assert.equal(inserted.data.data.href,'/app/application');
  assert.equal((await clients[0].from('notifications').select('id').eq('id',id)).data.length,1);
  assert.equal((await clients[1].from('notifications').select('id').eq('id',id)).data.length,0);
  assert.equal((await clients[1].from('notifications').update({read_at:new Date().toISOString()}).eq('id',id).select('id')).data.length,0);
  assert.ok((await clients[0].from('notifications').update({title:'Forged'}).eq('id',id)).error);
  assert.equal((await clients[0].from('notifications').update({read_at:new Date().toISOString()}).eq('id',id).select('id')).data.length,1);
  assert.ok((await clients[0].rpc('professional_application_detail',{target_provider_id:users[1]})).error);
  assert.ok((await clients[0].rpc('professional_application_history',{target_provider_id:users[1]})).error);
  assert.ok((await clients[0].rpc('claim_transactional_emails',{batch_size:10})).error);
  const delivery=await service.from('notification_deliveries').select('id,status').eq('notification_id',id).single();assert.equal(delivery.error,null);
  assert.equal((await clients[0].from('notification_deliveries').select('id').eq('id',delivery.data.id)).data.length,0);
  const claimed=await Promise.all([service.rpc('claim_transactional_emails',{batch_size:20}),service.rpc('claim_transactional_emails',{batch_size:20})]);
  claimed.forEach(result=>assert.equal(result.error,null));
  assert.equal(claimed.flatMap(result=>result.data).filter(row=>row.delivery_id===delivery.data.id).length,1);
  assert.equal((await service.from('notification_deliveries').update({first_attempt_at:new Date(Date.now()-24*60*60*1000).toISOString(),last_attempt_at:new Date(Date.now()-5*60*1000).toISOString()}).eq('id',delivery.data.id)).error,null);
  assert.equal((await service.rpc('claim_transactional_emails',{batch_size:20})).error,null);
  assert.equal((await service.from('notification_deliveries').select('status').eq('id',delivery.data.id).single()).data.status,'needs_review');
  console.log(JSON.stringify({ok:true,recipientIsolation:true,readOnlyContent:true,privateDossierDenied:true,outboxPrivate:true,concurrentClaimsDeduplicated:true,ambiguousRetryStopped:true}));
} finally {
  for(const client of clients) await client.auth.signOut();
  for(const id of users.reverse()) assert.equal((await service.auth.admin.deleteUser(id)).error,null);
}
