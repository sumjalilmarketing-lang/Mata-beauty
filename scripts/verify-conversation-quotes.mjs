import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { verifyQaMfa } from './qa-mfa.mjs';

const url = process.env.REMOTE_SUPABASE_URL;
if (url !== 'https://kazlvtxkbsdhbfvtqqdp.supabase.co') throw new Error('Isolated QA only');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const accounts = [], results = [], conversations = [], quoteIds = [], run = randomUUID();
const ok = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const check = (action, assertion) => { assertion(); results.push({ action, status: 'PASS' }); };
let businessId, ownerId;
try {
  for (const role of ['provider', 'client-a', 'client-b', 'reviewer']) {
    const email = 'codex-quotes-' + role + '-' + run + '@example.test', password = 'QA-' + randomUUID() + '!';
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { qa_suppress_email: true }, user_metadata: { legal_accepted: true, professional_intent: role === 'provider' } })).user;
    const api = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY, options);
    accounts.push({ id: user.id, api });
    ok(await api.auth.signInWithPassword({ email, password })); ok(await api.rpc('synchronize_account_status'));
  }
  const [owner, clientA, clientB, reviewer] = accounts; ownerId = owner.id;
  ok(await admin.from('provider_profiles').upsert({ profile_id: owner.id, business_name: 'QA Devis', slug: 'qa-quotes-' + run, city: 'Dakar', status: 'approved', service_mode: 'salon' }));
  const role = ok(await admin.from('admin_roles').select('id').eq('key', 'super_admin').single());
  ok(await admin.from('profiles').update({ role: 'admin' }).eq('id', reviewer.id));
  ok(await admin.from('admin_user_roles').insert({ user_id: reviewer.id, role_id: role.id, assigned_by: reviewer.id, is_active: true, requires_mfa: true }));
  await verifyQaMfa(reviewer.api);
  businessId = ok(await owner.api.from('businesses').insert({ owner_id: owner.id, name: 'QA Devis', slug: 'qa-quotes-' + run,
    business_type: 'salon', address: 'Adresse QA Dakar', city: 'Dakar', status: 'draft' }).select('id').single()).id;
  ok(await reviewer.api.from('businesses').update({ status: 'approved' }).eq('id', businessId));
  const reference = ok(await admin.from('services').select('id').eq('is_active', true).limit(1).single());
  const serviceId = ok(await owner.api.from('provider_services').insert({ provider_id: owner.id, business_id: businessId,
    service_id: reference.id, title: 'Tresses devis QA', duration_minutes: 60, price_amount: 15000, currency: 'XOF', is_active: true }).select('id').single()).id;
  const day = new Date(Date.now() + 5 * 86400000); day.setUTCHours(10, 0, 0, 0);
  const date = day.toISOString().slice(0, 10), at = hour => date + 'T' + String(hour).padStart(2, '0') + ':00:00Z';
  const employee = ok(await owner.api.rpc('save_team_member', { target_business_id: businessId, target_member_id: null,
    member: { first_name: 'Awa', public_last_name: 'QA', buffer_minutes: 30 }, service_ids: [serviceId] }));
  ok(await owner.api.from('collaborator_hours').insert({ collaborator_id: employee, weekday: day.getUTCDay(), starts_at: '08:00', ends_at: '18:00', slot_interval_minutes: 30 }));
  ok(await owner.api.rpc('set_team_booking_enabled', { target_business_id: businessId, enabled: true }));
  for (const actor of [clientA, clientB]) conversations.push(ok(await actor.api.rpc('ensure_provider_conversation', { target_provider_id: owner.id })));
  const draftInput = (thread = conversations[0]) => ({ target_conversation_id: thread, target_provider_service_id: serviceId,
    target_description: 'Tresses personnalisées QA', target_base_amount: 12000, target_base_duration_minutes: 90,
    target_valid_until: new Date(Date.now() + 3 * 86400000).toISOString(), target_conditions: 'Options obligatoires incluses au récapitulatif.', target_client_nonce: randomUUID() });
  const save = async input => { const q = ok(await owner.api.rpc('save_conversation_quote', input)); quoteIds.push(q.id); return q; };
  const send = async q => ok(await owner.api.rpc('send_conversation_quote', { target_quote_id: q.id, target_expected_version: q.version, target_client_nonce: randomUUID() }));
  const accept = async (q, actor = clientA) => ok(await actor.api.rpc('respond_to_conversation_quote', { target_quote_id: q.id, target_decision: 'accept', target_expected_version: q.version, target_client_nonce: randomUUID() }));
  const bookInput = (q, hour = 10) => ({ target_quote_id: q.id, target_starts_at: at(hour), target_collaborator_id: employee,
    target_location_mode: 'salon', target_client_nonce: randomUUID(), target_expected_total: q.total_amount });
  const input = draftInput();
  const draft = await save(input), retry = await save(input);
  check('Draft creation retry returns one immutable identity', () => assert.equal(retry.id, draft.id));
  const unauthorizedCreate = await clientA.api.rpc('save_conversation_quote', draftInput());
  check('Client cannot create a professional quote', () => assert.equal(unauthorizedCreate.error?.code, '42501'));
  const hiddenDraft = ok(await clientA.api.from('conversation_quotes').select('id').eq('id', draft.id));
  check('Draft not disclosed to recipient before send', () => assert.equal(hiddenDraft.length, 0));
  const sent = await send(draft);
  await send(sent);
  const cards = ok(await admin.from('messages').select('id').eq('conversation_id', conversations[0]).eq('message_type', 'quote').contains('metadata', { quote_id: sent.id }));
  check('Repeated send creates exactly one card', () => assert.equal(cards.length, 1));
  const notice = ok(await admin.from('notifications').select('id,profile_id').eq('kind', 'message_created').contains('data', { message_id: cards[0].id }));
  check('Quote card notifies only the client once', () => { assert.equal(notice.length, 1); assert.equal(notice[0].profile_id, clientA.id); });
  const wrongThreadCard = await owner.api.from('messages').insert({ conversation_id: conversations[1], sender_id: owner.id,
    body: 'Référence de devis étrangère QA', message_type: 'quote', metadata: { quote_id: sent.id } });
  const spoofedQuoteCard = await clientA.api.from('messages').insert({ conversation_id: conversations[0], sender_id: clientA.id,
    body: 'Faux auteur QA', message_type: 'quote', metadata: { quote_id: sent.id } });
  check('A real quote ID cannot forge a card in another thread or author identity', () => {
    assert.equal(wrongThreadCard.error?.code, '42501'); assert.equal(spoofedQuoteCard.error?.code, '42501');
  });
  const stolen = await clientB.api.rpc('get_conversation_quote', { target_quote_id: sent.id });
  const wrongDecision = await clientB.api.rpc('respond_to_conversation_quote', { target_quote_id: sent.id, target_decision: 'accept', target_expected_version: sent.version, target_client_nonce: randomUUID() });
  check('Other client cannot read or accept the quote', () => { assert.equal(stolen.error?.code, '42501'); assert.equal(wrongDecision.error?.code, '42501'); });
  const forbiddenUpdate = await clientA.api.from('conversation_quotes').update({ total_amount: 1, status: 'accepted' }).eq('id', sent.id);
  const modifiedSent = await owner.api.rpc('save_conversation_quote', { ...input, target_quote_id: sent.id, target_expected_version: sent.version, target_base_amount: 1 });
  check('No direct price update and no modification after send', () => { assert(forbiddenUpdate.error); assert(modifiedSent.error); });
  const accepted = await accept(sent); await accept(accepted);
  const foreignBooking = await clientB.api.from('bookings').insert({ client_id: clientB.id, provider_id: owner.id, provider_service_id: serviceId,
    conversation_quote_id: accepted.id, collaborator_id: employee, starts_at: at(10), ends_at: at(11),
    status: 'pending', location_mode: 'salon', total_amount: 1, currency: 'XOF' });
  const promotionInjection = await clientA.api.from('bookings').insert({ client_id: clientA.id, provider_id: owner.id, provider_service_id: serviceId,
    conversation_quote_id: accepted.id, promotion_id: randomUUID(), collaborator_id: employee, starts_at: at(10), ends_at: at(11),
    status: 'pending', location_mode: 'salon', total_amount: 1, currency: 'XOF' });
  check('Direct booking rejects another recipient quote and injected promotion', () => {
    assert.equal(foreignBooking.error?.code, '42501'); assert(promotionInjection.error); assert.match(promotionInjection.error.message, /promotion/);
  });
  const acceptedNotices = ok(await admin.from('notifications').select('id,profile_id').eq('kind', 'quote_accepted').contains('data', { quote_id: sent.id }));
  check('Repeated accept has one professional notification', () => { assert.equal(acceptedNotices.length, 1); assert.equal(acceptedNotices[0].profile_id, owner.id); });
  const availability = ok(await clientA.api.rpc('get_conversation_quote_availability', { target_quote_id: accepted.id, target_day: date }));
  check('Effective quote duration and employee buffer respected in slots', () => {
    assert(availability.slots.some(s => s.slot_start.startsWith(date + 'T16:00')));
    assert(!availability.slots.some(s => s.slot_start.startsWith(date + 'T16:30')));
  });
  const preview = ok(await clientA.api.rpc('preview_conversation_quote_booking', { target_quote_id: accepted.id, target_starts_at: at(10), target_collaborator_id: employee }));
  check('Recap uses custom price and effective duration, no payment claimed', () => {
    assert.equal(preview.booking.total_amount, accepted.total_amount);
    assert.equal((Date.parse(preview.booking.ends_at) - Date.parse(preview.booking.starts_at)) / 60000, accepted.duration_minutes);
    assert.equal(preview.payment_status, 'not_initiated');
  });
  const mismatch = await clientA.api.rpc('book_conversation_quote', { ...bookInput(accepted), target_expected_total: 1 });
  check('Stale or forged expected total cannot confirm a booking', () => assert(mismatch.error));
  const race = await Promise.all([1, 2].map(() => clientA.api.rpc('book_conversation_quote', bookInput(accepted))));
  race.forEach(ok);
  check('Double confirmation creates one appointment', () => assert.equal(new Set(race.map(r => r.data.booking.id)).size, 1));
  const booked = race[0].data.booking;
  const detach = await clientA.api.from('bookings').update({ conversation_quote_id: null }).eq('id', booked.id);
  check('Persisted booking cannot detach its contractual quote reference', () => assert(detach.error));
  check('Correct quote, conversation and employee are persisted', () => {
    assert.equal(booked.conversation_quote_id, accepted.id); assert.equal(booked.conversation_id, conversations[0]);
    assert.equal(booked.collaborator_id, employee); assert.equal(booked.total_amount, accepted.total_amount); assert.equal(booked.status, 'pending');
  });
  const duplicateThreads = ok(await admin.from('conversations').select('id').eq('booking_id', booked.id));
  const payments = ok(await admin.from('payments').select('id').eq('booking_id', booked.id));
  check('No second conversation and no simulated payment', () => { assert.equal(duplicateThreads.length, 0); assert.equal(payments.length, 0); });
  const another = await accept(await send(await save(draftInput(conversations[1]))), clientB);
  const conflict = await clientB.api.rpc('book_conversation_quote', bookInput(another));
  check('Second quote cannot take an occupied employee', () => assert.equal(conflict.error?.code, '23P01'));
  const expired = await send(await save(draftInput()));
  ok(await admin.from('conversation_quotes').update({ valid_until: new Date(Date.now() - 60000).toISOString(), version: expired.version + 1 }).eq('id', expired.id));
  const expiryResult = await accept({ ...expired, version: expired.version + 1 });
  check('Expired quote is persisted expired and cannot be accepted', () => assert.equal(expiryResult.status, 'expired'));
  const expiryBook = await clientA.api.rpc('book_conversation_quote', bookInput(expired, 14));
  check('Expired quote cannot create appointment', () => assert(expiryBook.error));
  for (const state of [{ is_suspended: true, account_status: 'active' }, { is_suspended: false, account_status: 'disabled' }]) {
    ok(await admin.from('profiles').update(state).eq('id', clientA.id));
    const staleJwtRead = await clientA.api.rpc('get_conversation_quote', { target_quote_id: accepted.id });
    const rlsRead = ok(await clientA.api.from('conversation_quotes').select('id'));
    check('Inactive recipient with existing JWT loses quote API and table access', () => { assert.equal(staleJwtRead.error?.code, '42501'); assert.equal(rlsRead.length, 0); });
    ok(await admin.from('profiles').update({ is_suspended: false, account_status: 'active' }).eq('id', clientA.id));
  }
  const cancelled = await send(await save(draftInput()));
  const cancellation = ok(await owner.api.rpc('cancel_conversation_quote', { target_quote_id: cancelled.id, target_expected_version: cancelled.version }));
  check('Owner cancellation is visible and final', () => assert.equal(cancellation.status, 'cancelled'));
  const foreignConversationBooking = await clientB.api.from('bookings').insert({ client_id: clientB.id, provider_id: owner.id, provider_service_id: serviceId,
    conversation_id: conversations[0], collaborator_id: employee, starts_at: at(14), ends_at: at(15),
    status: 'pending', location_mode: 'salon', total_amount: 15000, currency: 'XOF' });
  check('Ordinary booking cannot attach another client direct conversation', () => {
    assert(foreignConversationBooking.error); assert.match(foreignConversationBooking.error.message, /Conversation et réservation incohérentes/);
  });
  const ordinary = ok(await clientB.api.from('bookings').insert({ client_id: clientB.id, provider_id: owner.id, provider_service_id: serviceId,
    collaborator_id: employee, starts_at: at(14), ends_at: at(15), status: 'pending', location_mode: 'salon', total_amount: 1, currency: 'USD' }).select('id,total_amount,currency,ends_at,conversation_quote_id').single());
  check('Ordinary catalog booking retains server-owned price/currency/duration', () => {
    assert.equal(ordinary.total_amount, 15000); assert.equal(ordinary.currency, 'XOF'); assert.equal(Date.parse(ordinary.ends_at), Date.parse(at(15))); assert.equal(ordinary.conversation_quote_id, null);
  });
  const ordinaryThread = ok(await admin.from('conversations').select('id').eq('booking_id', ordinary.id).single());
  const ordinaryMembers = ok(await admin.from('conversation_members').select('profile_id').eq('conversation_id', ordinaryThread.id));
  check('Ordinary booking automatically creates a conversation for its participants', () => {
    assert(ordinaryMembers.some(member => member.profile_id === clientB.id)); assert(ordinaryMembers.some(member => member.profile_id === owner.id));
  });
  ok(await owner.api.rpc('set_team_booking_enabled', { target_business_id: businessId, enabled: false }));
  ok(await owner.api.from('availability_rules').insert({ provider_id: owner.id, weekday: day.getUTCDay(), starts_at: '08:00', ends_at: '18:00', slot_interval_minutes: 30 }));
  const short = await accept(await send(await save({ ...draftInput(), target_base_duration_minutes: 30 })));
  const independentSlots = ok(await clientA.api.rpc('get_conversation_quote_availability', { target_quote_id: short.id, target_day: date }));
  check('Independent availability uses shorter custom duration at closing', () => assert(independentSlots.slots.some(s => s.slot_start.startsWith(date + 'T17:30'))));
  const shortBooking = ok(await clientA.api.rpc('book_conversation_quote', { ...bookInput(short), target_starts_at: date + 'T17:30:00Z', target_collaborator_id: null }));
  check('Independent quote books exact custom duration without employee', () => {
    assert.equal(shortBooking.booking.collaborator_id, null);
    assert.equal(Date.parse(shortBooking.booking.ends_at), Date.parse(at(18)));
  });
  // Separate service keeps the ordinary catalog baseline above unchanged.
  const optionService = ok(await owner.api.from('provider_services').insert({ provider_id: owner.id, business_id: businessId,
    service_id: reference.id, title: 'Options et domicile QA', duration_minutes: 60, price_amount: 20000, currency: 'XOF',
    is_active: true, location_modes: ['salon', 'client_address'], home_service_radius_km: 10, travel_fee_amount: 500,
    travel_fee_per_km_amount: 100, free_travel_radius_km: 0 }).select('id').single());
  const required = ok(await owner.api.from('service_options').insert({ provider_service_id: optionService.id, name: 'Soin obligatoire QA',
    price_amount: 1500, duration_minutes: 15, is_required: true }).select('id').single());
  const unauthorizedOption = await clientA.api.from('service_options').insert({ provider_service_id: optionService.id,
    name: 'Option usurpée', price_amount: 1 });
  const foreignOptionUpdate = await clientB.api.from('service_options').update({ price_amount: 1 }).eq('id', required.id).select('id');
  check('Service-option RLS blocks client writes and foreign modifications', () => {
    assert(unauthorizedOption.error); assert(foreignOptionUpdate.error || foreignOptionUpdate.data.length === 0);
  });
  ok(await admin.from('businesses').update({ latitude: 14.7, longitude: -17.45 }).eq('id', businessId));
  const optionDraft = await save({ ...draftInput(), target_provider_service_id: optionService.id, target_base_duration_minutes: 75 });
  check('Required options add authoritative price and duration to the quote', () => {
    assert.equal(optionDraft.base_amount, 12000); assert.equal(optionDraft.options_amount, 1500);
    assert.equal(optionDraft.total_amount, 13500); assert.equal(optionDraft.duration_minutes, 90);
    assert.deepEqual(optionDraft.selected_option_ids, [required.id]);
  });
  const optionQuote = await accept(await send(optionDraft));
  const homeInput = { target_quote_id: optionQuote.id, target_starts_at: at(8), target_collaborator_id: null,
    target_location_mode: 'client_address', target_address: 'Adresse synthétique QA', target_latitude: 14.71, target_longitude: -17.45 };
  const homePreview = ok(await clientA.api.rpc('preview_conversation_quote_booking', homeInput));
  check('Home recap adds fixed and distance fees with geographic validation', () => {
    assert.equal(homePreview.booking.distance_travel_fee_amount, 200);
    assert.equal(homePreview.booking.total_amount, 14200);
    assert.equal(homePreview.booking.base_amount, 12500); assert.equal(homePreview.booking.options_amount, 1500);
    assert(homePreview.booking.travel_distance_km > 1 && homePreview.booking.travel_distance_km < 2);
  });
  const outside = await clientA.api.rpc('preview_conversation_quote_booking', { ...homeInput, target_latitude: 15.7 });
  const missingCoordinates = await clientA.api.rpc('preview_conversation_quote_booking', { ...homeInput, target_latitude: null });
  check('Out-of-radius and ungeolocated home addresses are rejected', () => { assert(outside.error); assert(missingCoordinates.error); });
  ok(await owner.api.from('provider_services').update({ price_amount: 90000, travel_fee_amount: 999 }).eq('id', optionService.id));
  const frozenPrice = ok(await clientA.api.rpc('preview_conversation_quote_booking', homeInput));
  check('Catalog price changes cannot rewrite accepted quote or fixed travel fee', () => assert.equal(frozenPrice.booking.total_amount, 14200));
  ok(await owner.api.from('service_options').update({ price_amount: 2000 }).eq('id', required.id));
  const changedRequired = await clientA.api.rpc('book_conversation_quote', { ...homeInput, target_client_nonce: randomUUID(), target_expected_total: 14200 });
  check('Changed mandatory option blocks conversion instead of silently repricing', () => { assert(changedRequired.error); assert.match(changedRequired.error.message, /options obligatoires/); });
  ok(await owner.api.from('service_options').update({ price_amount: 1500 }).eq('id', required.id));
  const homeBooking = ok(await clientA.api.rpc('book_conversation_quote', { ...homeInput, target_client_nonce: randomUUID(), target_expected_total: 14200 }));
  check('Home booking persists exact fee recap, options, duration and coordinates', () => {
    assert.equal(homeBooking.booking.total_amount, 14200); assert.equal(homeBooking.booking.distance_travel_fee_amount, 200);
    assert.equal(homeBooking.booking.appointment_latitude, 14.71); assert.equal(homeBooking.booking.appointment_longitude, -17.45);
    assert.deepEqual(homeBooking.booking.selected_option_ids, [required.id]);
    assert.equal(Date.parse(homeBooking.booking.ends_at) - Date.parse(homeBooking.booking.starts_at), 90 * 60000);
    assert.equal(homeBooking.payment_status, 'not_initiated');
  });
  const events = ok(await admin.from('conversation_quote_events').select('version,to_status').eq('quote_id', accepted.id).order('version'));
  check('Quote lifecycle history is complete without duplicate events', () => assert.deepEqual(events.map(e => e.to_status), ['draft', 'sent', 'accepted']));
} catch (error) {
  results.push({ action: 'Conversation quote integration', status: 'FAIL', error: error.message }); process.exitCode = 1;
} finally {
  if (ownerId) ok(await admin.from('bookings').delete().eq('provider_id', ownerId));
  if (quoteIds.length) {
    const ids = [...new Set(quoteIds)];
    ok(await admin.from('conversation_quote_events').delete().in('quote_id', ids));
    ok(await admin.from('conversation_quotes').delete().in('id', ids));
  }
  if (conversations.length) ok(await admin.from('conversations').delete().in('id', conversations));
  if (businessId) ok(await admin.from('businesses').delete().eq('id', businessId));
  for (const account of accounts.reverse()) { await account.api.auth.signOut({ scope: 'global' }); ok(await admin.auth.admin.deleteUser(account.id)); }
  await mkdir('work/chantier-1', { recursive: true });
  await writeFile('work/chantier-1/quotes-api-results.json', JSON.stringify({ date: new Date().toISOString(), environment: 'QA', results }, null, 2));
  console.log(JSON.stringify(results));
}

