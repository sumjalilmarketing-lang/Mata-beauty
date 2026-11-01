import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { verifyQaMfa } from './qa-mfa.mjs';

const url = process.env.REMOTE_SUPABASE_URL;
if (url !== 'https://kazlvtxkbsdhbfvtqqdp.supabase.co') throw new Error('Isolated QA only');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const accounts = [], results = [], run = randomUUID();
const ok = result => { if (result.error) throw new Error(result.error.message); return result.data; };
let businessId, providerId;
const check = (action, assertion) => { assertion(); results.push({ action, status: 'PASS' }); };
try {
  for (const role of ['provider', 'client-a', 'client-b', 'reviewer']) {
    const email = `codex-team-${role}-${run}@example.test`, password = `QA-${randomUUID()}!`;
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { qa_suppress_email: true }, user_metadata: { legal_accepted: true, professional_intent: role === 'provider' } })).user;
    const api = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY, options);
    accounts.push({ id: user.id, api });
    ok(await api.auth.signInWithPassword({ email, password }));
    ok(await api.rpc('synchronize_account_status'));
  }
  const [owner, clientA, clientB, reviewer] = accounts;
  providerId = owner.id;
  ok(await admin.from('provider_profiles').upsert({ profile_id: owner.id, business_name: 'QA Équipe', slug: `qa-team-${run}`, city: 'Dakar', status: 'approved', service_mode: 'salon' }));
  const role = ok(await admin.from('admin_roles').select('id').eq('key', 'super_admin').single());
  ok(await admin.from('profiles').update({ role: 'admin' }).eq('id', reviewer.id));
  ok(await admin.from('admin_user_roles').insert({ user_id: reviewer.id, role_id: role.id, assigned_by: reviewer.id, is_active: true, requires_mfa: true }));
  await verifyQaMfa(reviewer.api);
  businessId = ok(await owner.api.from('businesses').insert({ owner_id: owner.id, name: 'QA Équipe', slug: `qa-team-${run}`, business_type: 'salon', address: 'Adresse QA Dakar', city: 'Dakar', status: 'draft' }).select('id').single()).id;
  ok(await reviewer.api.from('businesses').update({ status: 'approved' }).eq('id', businessId));
  const reference = ok(await admin.from('services').select('id').eq('is_active', true).limit(1).single());
  const serviceId = ok(await owner.api.from('provider_services').insert({ provider_id: owner.id, business_id: businessId, service_id: reference.id, title: 'Tresses QA', duration_minutes: 60, price_amount: 15000, currency: 'XOF', is_active: true }).select('id').single()).id;
  const day = new Date(Date.now() + 4 * 86400000); day.setUTCHours(10, 0, 0, 0);
  const date = day.toISOString().slice(0, 10);
  const employees = [];
  for (const first_name of ['Ndeye', 'Awa']) {
    const id = ok(await owner.api.rpc('save_team_member', { target_business_id: businessId, target_member_id: null, member: { first_name, public_last_name: 'QA', specialties: ['Tresses'], buffer_minutes: 30 }, service_ids: [serviceId] }));
    employees.push(id);
    ok(await owner.api.from('collaborator_hours').insert({ collaborator_id: id, weekday: day.getUTCDay(), starts_at: '08:00', ends_at: '18:00', slot_interval_minutes: 30 }));
  }
  ok(await owner.api.rpc('set_team_booking_enabled', { target_business_id: businessId, enabled: true }));
  const listing = ok(await clientA.api.rpc('get_booking_team_availability', { target_service_id: serviceId, from_date: date }));
  check('Qualified available employees exposed without creating accounts', () => { assert.equal(listing.teamEnabled, true); assert.equal(new Set(listing.slots.map(s => s.collaborator_id)).size, 2); });
  const denied = await clientA.api.rpc('save_team_member', { target_business_id: businessId, target_member_id: employees[0], member: { first_name: 'Forbidden' }, service_ids: [serviceId] });
  check('Client cannot manage another team', () => assert(denied.error));
  const privateHours = ok(await clientA.api.from('collaborator_hours').select('id').in('collaborator_id', employees));
  check('Private employee calendars protected by RLS', () => assert.equal(privateHours.length, 0));
  const payload = (client, hour, employee) => ({ client_id: client.id, provider_id: owner.id, provider_service_id: serviceId, collaborator_id: employee,
    starts_at: new Date(day.getTime() + hour * 3600000).toISOString(), ends_at: new Date(day.getTime() + (hour + 1) * 3600000).toISOString(), status: 'pending', location_mode: 'salon', total_amount: 1, currency: 'XOF' });
  const race = await Promise.all([clientA, clientB].map(c => c.api.from('bookings').insert(payload(c, 0, employees[0])).select('id,collaborator_name,total_amount').single()));
  check('Concurrent booking of same employee: exactly one winner', () => { assert.equal(race.filter(r => !r.error).length, 1); assert.equal(race.find(r => r.error)?.error.code, '23P01'); });
  const first = race.find(r => !r.error).data;
  check('Persisted identity and authoritative price', () => { assert.equal(first.collaborator_name, 'Ndeye QA'); assert.equal(first.total_amount, 15000); });
  const buffered = await clientB.api.from('bookings').insert(payload(clientB, 1, employees[0]));
  check('Employee buffer prevents adjacent incompatible appointment', () => assert(buffered.error));
  const autoRace = await Promise.all([clientA, clientB].map(c => c.api.from('bookings').insert(payload(c, 3, null)).select('id,collaborator_id').single()));
  check('Automatic concurrent assignments select distinct available employees', () => { autoRace.forEach(ok); assert.equal(new Set(autoRace.map(r => r.data.collaborator_id)).size, 2); });
  ok(await owner.api.from('collaborator_exceptions').insert({ collaborator_id: employees[0], starts_at: `${date}T09:00:00Z`, ends_at: `${date}T12:00:00Z`, kind: 'absence', reason: 'Absence QA' }));
  const agenda = ok(await owner.api.rpc('get_team_agenda', { target_business_id: businessId, from_date: date, days: 1 }));
  check('Absence flags existing appointment for reassignment', () => assert.equal(agenda.find(b => b.id === first.id)?.assignment_conflict, true));
  ok(await owner.api.rpc('reassign_booking_collaborator', { target_booking_id: first.id, target_collaborator_id: employees[1], reason: 'Absence QA' }));
  ok(await owner.api.rpc('reassign_booking_collaborator', { target_booking_id: first.id, target_collaborator_id: employees[1], reason: 'Repeated click' }));
  const history = ok(await owner.api.from('booking_assignments').select('id').eq('booking_id', first.id));
  check('Reassignment persisted once despite repeated action', () => assert.equal(history.length, 2));
  const stored = ok(await admin.from('bookings').select('collaborator_name').eq('id', first.id).single());
  check('New performer visible on booking', () => assert.equal(stored.collaborator_name, 'Awa QA'));
  const duplicateAuto = await Promise.all([1, 2].map(() => clientA.api.from('bookings').insert(payload(clientA, 5, null)).select('id').single()));
  check('Repeated automatic request cannot create two appointments', () => assert.equal(duplicateAuto.filter(r => !r.error).length, 1));
  const notifications = ok(await admin.from('notifications').select('id,profile_id,body,data').eq('kind', 'booking_assignment').contains('data', { booking_id: first.id }));
  const bookingClient = ok(await admin.from('bookings').select('client_id').eq('id', first.id).single()).client_id;
  check('Client receives initial assignment and exactly one reassignment', () => assert.equal(notifications.filter(n => n.profile_id === bookingClient).length, 2));
  check('Salon receives exactly one reassignment notification', () => assert.equal(notifications.filter(n => n.profile_id === owner.id).length, 1));
  const attempted = await clientB.api.rpc('reassign_booking_collaborator', { target_booking_id: first.id, target_collaborator_id: employees[0], reason: 'Forbidden client action' });
  check('Client cannot reassign appointment', () => assert(attempted.error));
  const noQualification = ok(await owner.api.rpc('save_team_member', { target_business_id: businessId, target_member_id: null, member: { first_name: 'Sans compétence', specialties: [] }, service_ids: [] }));
  ok(await owner.api.from('collaborator_hours').insert({ collaborator_id: noQualification, weekday: day.getUTCDay(), starts_at: '08:00', ends_at: '18:00' }));
  const unqualified = await clientB.api.from('bookings').insert(payload(clientB, -1, noQualification));
  check('Unqualified employee rejected server-side', () => assert(unqualified.error));
  ok(await owner.api.from('collaborators').update({ is_active: false }).eq('id', employees[0]));
  const inactive = await clientB.api.from('bookings').insert(payload(clientB, -2, employees[0]));
  check('Inactive employee rejected server-side', () => assert(inactive.error));
  for (const status of ['confirmed', 'in_progress', 'completed']) ok(await owner.api.from('bookings').update({ status }).eq('id', first.id));
  const author = accounts.find(a => a.id === bookingClient);
  const review = ok(await author.api.from('reviews').insert({ booking_id: first.id, client_id: author.id, provider_id: owner.id, rating: 5, comment: 'Prestation équipe QA', collaborator_id: employees[0] }).select('collaborator_id,collaborator_name').single());
  check('Verified review uses actual performer, ignoring forged employee', () => { assert.equal(review.collaborator_id, employees[1]); assert.equal(review.collaborator_name, 'Awa QA'); });
  for (const [state, blockedProfile] of [
    ['suspended', { is_suspended: true, account_status: 'active' }],
    ['disabled', { is_suspended: false, account_status: 'disabled' }],
  ]) {
    // Keep the existing JWT to verify revocation at the data boundary, not just UI logout.
    ok(await admin.from('profiles').update(blockedProfile).eq('id', owner.id));
    const blockedAgenda = await owner.api.rpc('get_team_agenda', { target_business_id: businessId, from_date: date, days: 1 });
    const blockedCandidates = await owner.api.rpc('get_reassignment_candidates', { target_booking_id: first.id });
    check(`${state} owner cannot read agenda or reassignment candidates with an existing JWT`, () => {
      assert.equal(blockedAgenda.error?.code, '42501'); assert.equal(blockedCandidates.error?.code, '42501');
    });
    const hiddenHours = ok(await owner.api.from('collaborator_hours').select('id').in('collaborator_id', employees));
    const hiddenAbsences = ok(await owner.api.from('collaborator_exceptions').select('id').in('collaborator_id', employees));
    const hiddenHistory = ok(await owner.api.from('booking_assignments').select('id').eq('booking_id', first.id));
    check(`${state} owner cannot read private calendars or assignment history`, () => {
      assert.equal(hiddenHours.length, 0); assert.equal(hiddenAbsences.length, 0); assert.equal(hiddenHistory.length, 0);
    });
    const blockedEmployee = await owner.api.from('collaborators').update({ title: 'Forbidden while inactive' }).eq('id', employees[1]).select('id');
    const blockedEnable = await owner.api.from('businesses').update({ team_booking_enabled: false }).eq('id', businessId).select('id');
    check(`${state} owner cannot bypass RPC guards with direct team writes`, () => {
      assert(blockedEmployee.error || blockedEmployee.data.length === 0);
      assert(blockedEnable.error || blockedEnable.data.length === 0);
    });
    const unchangedEmployee = ok(await admin.from('collaborators').select('title').eq('id', employees[1]).single());
    const unchangedTeam = ok(await admin.from('businesses').select('team_booking_enabled').eq('id', businessId).single());
    assert.notEqual(unchangedEmployee.title, 'Forbidden while inactive'); assert.equal(unchangedTeam.team_booking_enabled, true);
    ok(await admin.from('profiles').update({ is_suspended: false, account_status: 'active' }).eq('id', owner.id));
    ok(await admin.from('profiles').update(blockedProfile).eq('id', author.id));
    const hiddenClientHistory = ok(await author.api.from('booking_assignments').select('id').eq('booking_id', first.id));
    check(`${state} client cannot read private assignment history`, () => assert.equal(hiddenClientHistory.length, 0));
    ok(await admin.from('profiles').update({ is_suspended: false, account_status: 'active' }).eq('id', author.id));
  }
  const restoredOwnerHistory = ok(await owner.api.from('booking_assignments').select('id').eq('booking_id', first.id));
  const restoredClientHistory = ok(await author.api.from('booking_assignments').select('id').eq('booking_id', first.id));
  check('Reactivated owner and client regain authorized history access', () => {
    assert.equal(restoredOwnerHistory.length, 2); assert.equal(restoredClientHistory.length, 2);
  });
  ok(await owner.api.rpc('set_team_booking_enabled', { target_business_id: businessId, enabled: false }));
  const disabledTeamAssignment = await clientA.api.from('bookings').insert(payload(clientA, 7, employees[1]));
  check('Explicit employee assignment rejected when team booking is disabled', () => {
    assert.equal(disabledTeamAssignment.error?.code, '23514');
    assert.match(disabledTeamAssignment.error.message, /réservation par collaborateur/);
  });
} catch (error) {
  results.push({ action: 'Employee assignment integration', status: 'FAIL', error: error.message }); process.exitCode = 1;
} finally {
  if (providerId) ok(await admin.from('bookings').delete().eq('provider_id', providerId));
  if (businessId) ok(await admin.from('businesses').delete().eq('id', businessId));
  for (const account of accounts.reverse()) { await account.api.auth.signOut({ scope: 'global' }); ok(await admin.auth.admin.deleteUser(account.id)); }
  await mkdir('work/employee-assignment', { recursive: true });
  await writeFile('work/employee-assignment/api-results.json', JSON.stringify({ date: new Date().toISOString(), environment: 'QA', results }, null, 2));
  console.log(JSON.stringify(results));
}
