import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.REMOTE_SUPABASE_URL;
if (url !== 'https://kazlvtxkbsdhbfvtqqdp.supabase.co') throw new Error('Isolated QA only');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const anon = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY, options);
const accounts = [], results = [], threads = [], objectPaths = [], run = randomUUID();
let bookingId;
const ok = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const check = (action, assertion) => { assertion(); results.push({ action, status: 'PASS' }); };
const rpc = (actor, name, args) => actor.api.rpc(name, args);
try {
  for (const label of ['provider-a', 'provider-b', 'client', 'outsider']) {
    const email = 'codex-msgsec-' + label + '-' + run + '@example.test', password = 'QA-' + randomUUID() + '!';
    const created = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { qa_suppress_email: true }, user_metadata: { legal_accepted: true, professional_intent: label.startsWith('provider') } })).user;
    const api = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY, options);
    accounts.push({ id: created.id, api });
    ok(await api.auth.signInWithPassword({ email, password })); ok(await api.rpc('synchronize_account_status'));
  }
  const [provider, providerB, client, outsider] = accounts;
  for (const [index, actor] of [provider, providerB].entries()) ok(await admin.from('provider_profiles').upsert({
    profile_id: actor.id, business_name: 'QA conversation ' + index, slug: 'qa-msgsec-' + index + '-' + run, city: 'Dakar', status: 'approved', service_mode: 'salon',
  }));
  const reference = ok(await admin.from('services').select('id').eq('is_active', true).limit(1).single());
  const service = ok(await provider.api.from('provider_services').insert({ provider_id: provider.id, service_id: reference.id,
    title: 'Prestation messagerie QA', price_amount: 12000, duration_minutes: 60, currency: 'XOF', is_active: true }).select('*').single());
  const pair = await Promise.all([1, 2].map(() => rpc(client, 'ensure_provider_conversation', { target_provider_id: provider.id })));
  pair.forEach(ok); threads.push(pair[0].data);
  check('Concurrent direct conversation creation is idempotent', () => assert.equal(pair[0].data, pair[1].data));
  threads.push(ok(await rpc(client, 'ensure_provider_conversation', { target_provider_id: providerB.id })));
  const conversation = threads[0], nonce = randomUUID();
  const sent = ok(await rpc(client, 'send_conversation_message', { target_conversation_id: conversation, target_body: 'Bonjour, pouvez-vous réaliser ce modèle ?', target_client_nonce: nonce }));
  const repeated = ok(await rpc(client, 'send_conversation_message', { target_conversation_id: conversation, target_body: 'Bonjour, pouvez-vous réaliser ce modèle ?', target_client_nonce: nonce }));
  check('Text nonce retry returns same persisted message', () => assert.equal(sent.message.id, repeated.message.id));
  const collided = await rpc(client, 'send_conversation_message', { target_conversation_id: threads[1], target_body: 'Bonjour, pouvez-vous réaliser ce modèle ?', target_client_nonce: nonce });
  check('Nonce cannot be reused to switch conversations', () => assert(collided.error));
  const forgedText = await client.api.from('messages').insert({ conversation_id: conversation, sender_id: client.id, body: 'Texte QA', message_type: 'text', metadata: { quote_id: randomUUID() } });
  const forgedMedia = await client.api.from('messages').insert({ conversation_id: conversation, sender_id: client.id, body: 'Fausse pièce jointe', message_type: 'image', metadata: { attachment_id: randomUUID() } });
  const forgedQuote = await provider.api.from('messages').insert({ conversation_id: conversation, sender_id: provider.id, body: 'Faux devis', message_type: 'quote', metadata: { quote_id: randomUUID() } });
  check('Direct forged metadata, media and quote cards are blocked', () => {
    assert.equal(forgedText.error?.code, '42501'); assert.equal(forgedMedia.error?.code, '42501'); assert.equal(forgedQuote.error?.code, '42501');
  });
  const spoof = await outsider.api.from('messages').insert({ conversation_id: conversation, sender_id: client.id, body: 'Message usurpé' });
  const outsiderRead = ok(await outsider.api.from('messages').select('id').eq('conversation_id', conversation));
  const outsiderList = ok(await rpc(outsider, 'list_my_conversations'));
  const outsiderGet = await rpc(outsider, 'get_my_conversation', { target_conversation_id: conversation });
  check('Outsider cannot spoof, read, list or open a private conversation', () => {
    assert(spoof.error); assert.equal(outsiderRead.length, 0); assert.equal(outsiderList.length, 0);
    assert(outsiderGet.error || !outsiderGet.data || (Array.isArray(outsiderGet.data) && outsiderGet.data.length === 0));
  });
  const quote = await rpc(client, 'save_conversation_quote', { target_conversation_id: conversation, target_provider_service_id: service.id,
    target_description: 'Tentative non autorisée', target_base_amount: 12000, target_base_duration_minutes: 60,
    target_valid_until: new Date(Date.now() + 86400000).toISOString(), target_client_nonce: randomUUID() });
  check('Client cannot turn conversation membership into quote creation rights', () => assert.equal(quote.error?.code, '42501'));
  const shared = ok(await rpc(provider, 'send_conversation_reference', { target_conversation_id: conversation, target_service_id: service.id, target_catalog: false, target_client_nonce: randomUUID() }));
  check('Active published provider service can be shared', () => assert.equal(shared.message.metadata.service_id, service.id));
  for (const [label, patch, restoration] of [
    ['inactive', { is_active: false }, { is_active: true }],
    ['archived', { archived_at: new Date().toISOString() }, { archived_at: null }],
    ...(Object.hasOwn(service, 'status') ? [['draft', { status: 'draft' }, { status: 'published' }]] : []),
  ]) {
    ok(await admin.from('provider_services').update(patch).eq('id', service.id));
    const denied = await rpc(provider, 'send_conversation_reference', { target_conversation_id: conversation, target_service_id: service.id, target_catalog: false, target_client_nonce: randomUUID() });
    check(label + ' service cannot be shared by privileged reference RPC', () => assert(denied.error));
    ok(await admin.from('provider_services').update(restoration).eq('id', service.id));
  }
  if (!Object.hasOwn(service, 'status')) results.push({ action: 'Draft service status exclusion', status: 'NOT TESTED', reason: 'Older isolated QA schema has no provider_services.status column.' });
  const asset = ok(await admin.rpc('prepare_message_attachment', { target_actor_id: client.id, target_conversation_id: conversation,
    target_mime_type: 'image/png', target_size_bytes: 68, target_client_nonce: randomUUID() }));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=', 'base64');
  ok(await admin.storage.from('message-attachments').upload(asset.storage_path, bytes, { contentType: 'image/png' })); objectPaths.push(asset.storage_path);
  const privateMeta = ok(await outsider.api.from('message_attachments').select('id').eq('id', asset.id));
  const signing = await outsider.api.storage.from('message-attachments').createSignedUrl(asset.storage_path, 60);
  const participantRawSign = await client.api.storage.from('message-attachments').createSignedUrl(asset.storage_path, 60);
  const forgedPrepare = await client.api.rpc('prepare_message_attachment', { target_actor_id: provider.id, target_conversation_id: conversation,
    target_mime_type: 'image/png', target_size_bytes: 68, target_client_nonce: randomUUID() });
  const publicUrl = anon.storage.from('message-attachments').getPublicUrl(asset.storage_path).data.publicUrl;
  const rawPublic = await fetch(publicUrl);
  check('Private attachment metadata, raw object and direct signing stay protected', () => {
    assert.equal(privateMeta.length, 0); assert(signing.error); assert(participantRawSign.error); assert(forgedPrepare.error); assert(!rawPublic.ok);
  });
  const rawWritePath = conversation + '/' + client.id + '/forbidden-' + randomUUID() + '.png';
  const rawUpload = await client.api.storage.from('message-attachments').upload(rawWritePath, bytes, { contentType: 'image/png' });
  if (!rawUpload.error) objectPaths.push(rawWritePath);
  check('Browser cannot bypass validation by uploading raw storage object', () => assert(rawUpload.error));
  const claimArgs = { target_actor_id: client.id, target_attachment_id: asset.id, target_client_nonce: asset.upload_nonce };
  const deniedClaims = await Promise.all([
    client.api.rpc('claim_message_attachment_validation', claimArgs), anon.rpc('claim_message_attachment_validation', claimArgs),
    admin.rpc('claim_message_attachment_validation', { ...claimArgs, target_actor_id: outsider.id }),
    admin.rpc('claim_message_attachment_validation', { ...claimArgs, target_client_nonce: randomUUID() }),
  ]);
  check('Validation leases require the server role, exact uploader and upload nonce', () => deniedClaims.forEach(result => assert.equal(result.error?.code, '42501')));
  const concurrentClaims = (await Promise.all([1, 2].map(() => admin.rpc('claim_message_attachment_validation', claimArgs)))).map(ok);
  const firstClaim = concurrentClaims.find(result => result.status === 'claimed');
  const claimedRow = ok(await admin.from('message_attachments').select('validation_attempts').eq('id', asset.id).single());
  check('Concurrent complete requests obtain one validation lease and consume one attempt', () => {
    assert.deepEqual(concurrentClaims.map(result => result.status).sort(), ['busy', 'claimed']);
    assert(firstClaim.lease_id); assert.equal(claimedRow.validation_attempts, 1);
  });
  const completion = { target_actor_id: client.id, target_attachment_id: asset.id, target_width: 1, target_height: 1,
    target_duration_seconds: null, target_size_bytes: bytes.length, target_validation_lease: firstClaim.lease_id };
  const browserCompletion = await client.api.rpc('complete_message_attachment', completion);
  // Only these temporary QA fixtures have their lease clock advanced. No sleep
  // or weakening of the deployed TTL is necessary to exercise expired retries.
  ok(await admin.from('message_attachments').update({ validation_lease_until: new Date(Date.now() - 1000).toISOString() }).eq('id', asset.id));
  const expiredCompletion = await admin.rpc('complete_message_attachment', completion);
  const nextClaim = ok(await admin.rpc('claim_message_attachment_validation', claimArgs));
  const supersededCompletion = await admin.rpc('complete_message_attachment', completion);
  check('Expired and superseded leases cannot finalize, and browser cannot call completion', () => {
    assert.equal(browserCompletion.error?.code, '42501'); assert.equal(expiredCompletion.error?.code, '42501');
    assert.equal(supersededCompletion.error?.code, '42501'); assert.equal(nextClaim.status, 'claimed'); assert.notEqual(nextClaim.lease_id, firstClaim.lease_id);
  });
  // Known tiny image fixture models the validator output. Binary validation is
  // tested by the route/domain suite; this check verifies the SQL lease contract.
  const validatedPath = asset.storage_path.replace(/(\.[a-z]+)$/, '-validated$1');
  ok(await admin.storage.from('message-attachments').upload(validatedPath, bytes, { contentType: 'image/png' })); objectPaths.push(validatedPath);
  const completedMedia = ok(await admin.rpc('complete_message_attachment', { ...completion, target_validation_lease: nextClaim.lease_id }));
  const repeatedMedia = ok(await admin.rpc('complete_message_attachment', { ...completion, target_validation_lease: nextClaim.lease_id }));
  const readyClaim = ok(await admin.rpc('claim_message_attachment_validation', claimArgs));
  const persistedMedia = ok(await admin.from('messages').select('id').eq('sender_id', client.id).eq('client_nonce', asset.upload_nonce));
  const readyAttachment = ok(await admin.from('message_attachments').select('status,validation_attempts,validation_lease_id,validation_lease_until').eq('id', asset.id).single());
  check('Successful completion clears the lease and ready retries preserve one message', () => {
    assert.equal(completedMedia.message.id, repeatedMedia.message.id); assert.equal(readyClaim.status, 'ready');
    assert.equal(readyClaim.message.id, completedMedia.message.id); assert.equal(persistedMedia.length, 1);
    assert.equal(readyAttachment.status, 'ready'); assert.equal(readyAttachment.validation_attempts, 2);
    assert.equal(readyAttachment.validation_lease_id, null); assert.equal(readyAttachment.validation_lease_until, null);
  });
  const exhaustedAsset = ok(await admin.rpc('prepare_message_attachment', { target_actor_id: client.id, target_conversation_id: conversation,
    target_mime_type: 'image/png', target_size_bytes: 68, target_client_nonce: randomUUID() }));
  const exhaustedArgs = { target_actor_id: client.id, target_attachment_id: exhaustedAsset.id, target_client_nonce: exhaustedAsset.upload_nonce };
  for (let attempt = 0; attempt < 5; attempt++) {
    const claimed = ok(await admin.rpc('claim_message_attachment_validation', exhaustedArgs)); assert.equal(claimed.status, 'claimed');
    ok(await admin.from('message_attachments').update({ validation_lease_until: new Date(Date.now() - 1000).toISOString() }).eq('id', exhaustedAsset.id));
  }
  const exhaustedClaim = ok(await admin.rpc('claim_message_attachment_validation', exhaustedArgs));
  const exhaustedRow = ok(await admin.from('message_attachments').select('validation_attempts,status').eq('id', exhaustedAsset.id).single());
  check('Five abandoned validations exhaust the attachment without a sixth attempt', () => {
    assert.equal(exhaustedClaim.status, 'exhausted'); assert.equal(exhaustedRow.validation_attempts, 5); assert.equal(exhaustedRow.status, 'pending');
  });
  const day = new Date(Date.now() + 6 * 86400000); day.setUTCHours(10, 0, 0, 0);
  ok(await provider.api.from('availability_rules').insert({ provider_id: provider.id, weekday: day.getUTCDay(), starts_at: '08:00', ends_at: '18:00', slot_interval_minutes: 30 }));
  bookingId = ok(await client.api.from('bookings').insert({ client_id: client.id, provider_id: provider.id, provider_service_id: service.id,
    starts_at: day.toISOString(), ends_at: new Date(day.getTime() + 3600000).toISOString(), status: 'pending', location_mode: 'salon', total_amount: 12000, currency: 'XOF' }).select('id').single()).id;
  for (const state of [{ is_suspended: true, account_status: 'active' }, { is_suspended: false, account_status: 'disabled' }]) {
    ok(await admin.from('profiles').update(state).eq('id', client.id));
    const direct = await client.api.from('messages').insert({ conversation_id: conversation, sender_id: client.id, body: 'Compte inactif' });
    const sending = await rpc(client, 'send_conversation_message', { target_conversation_id: conversation, target_body: 'Compte inactif', target_client_nonce: randomUUID() });
    const reading = ok(await client.api.from('messages').select('id').eq('conversation_id', conversation));
    const listing = ok(await rpc(client, 'list_my_conversations'));
    const legacyResult = await rpc(client, 'list_my_booking_conversations');
    const legacyUnavailable = ['PGRST202', '42883'].includes(legacyResult.error?.code);
    if (legacyUnavailable) results.push({ action: 'Inactive JWT denied legacy conversation list', status: 'NOT TESTED', reason: 'Legacy list_my_booking_conversations is absent from the isolated QA schema.' });
    else check('Inactive JWT denied legacy conversation list', () => assert.equal(ok(legacyResult).length, 0));
    const metadata = ok(await client.api.from('message_attachments').select('id').eq('id', asset.id));
    const inactiveClaim = await admin.rpc('claim_message_attachment_validation', claimArgs);
    check('Inactive existing JWT loses current lists, reads, sending and attachment access', () => {
      assert(direct.error); assert(sending.error); assert.equal(reading.length, 0); assert.equal(listing.length, 0);
      assert.equal(metadata.length, 0); assert.equal(inactiveClaim.error?.code, '42501');
    });
    ok(await admin.from('profiles').update({ is_suspended: false, account_status: 'active' }).eq('id', client.id));
  }
  const restored = ok(await rpc(client, 'list_my_conversations'));
  check('Reactivated account regains only its own conversation history', () => assert(restored.some(c => c.conversation_id === conversation)));
  // Controlled QA fixtures only: age earlier messages so this tests exactly the
  // configured 30/minute threshold rather than the setup actions.
  ok(await admin.from('messages').update({ created_at: new Date(Date.now() - 120000).toISOString() }).eq('sender_id', provider.id));
  for (let index = 0; index < 30; index++) ok(await rpc(provider, 'send_conversation_message', { target_conversation_id: conversation,
    target_body: 'Réponse de recette numéro ' + index, target_client_nonce: randomUUID() }));
  const throttled = await rpc(provider, 'send_conversation_message', { target_conversation_id: conversation, target_body: 'Au-delà de la limite', target_client_nonce: randomUUID() });
  check('Thirty messages per minute limit rejects the next send', () => { assert(throttled.error); assert.match(throttled.error.message, /fréquents/); });
} catch (error) {
  results.push({ action: 'Conversation security integration', status: 'FAIL', error: error.message }); process.exitCode = 1;
} finally {
  if (objectPaths.length) ok(await admin.storage.from('message-attachments').remove(objectPaths));
  if (bookingId) ok(await admin.from('bookings').delete().eq('id', bookingId));
  if (threads.length) ok(await admin.from('conversations').delete().in('id', threads));
  for (const account of accounts.reverse()) { await account.api.auth.signOut({ scope: 'global' }); ok(await admin.auth.admin.deleteUser(account.id)); }
  await mkdir('work/chantier-1', { recursive: true });
  await writeFile('work/chantier-1/conversation-security-results.json', JSON.stringify({ environment: 'QA', date: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify(results));
}

