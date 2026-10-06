import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.REMOTE_SUPABASE_URL;
if (url !== 'https://kazlvtxkbsdhbfvtqqdp.supabase.co' && !(url === 'https://qjdwxdbvrxedyfolnpol.supabase.co' && process.env.ALLOW_PRODUCTION_QA === 'mata-beauty.com')) throw new Error('Explicit QA target required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const accounts = [], rows = [], run = randomUUID();
let providerId, serviceId;
const requireResult = result => { if (result.error) throw result.error; return result.data; };
try {
  for (const role of ['provider', 'client-a', 'client-b']) {
    const email = `codex-concurrency-${role}-${run}@example.test`, password = `QA-${randomUUID()}!`;
    const created = requireResult(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { qa_suppress_email: true }, user_metadata: { legal_accepted: true, professional_intent: role === 'provider' } }));
    const id = created.user.id, api = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY, options);
    accounts.push({ id, api });
    requireResult(await api.auth.signInWithPassword({ email, password }));
    if (role === 'provider') {
      providerId = id;
      requireResult(await admin.from('provider_profiles').upsert({ profile_id: id, business_name: `Recette concurrence ${run}`, slug: `concurrence-${run}`, city: 'Dakar', status: 'approved', service_mode: 'salon' }));
    }
  }
  const reference = requireResult(await admin.from('services').select('id').eq('is_active', true).limit(1).single());
  serviceId = requireResult(await admin.from('provider_services').insert({ provider_id: providerId, service_id: reference.id, title: 'Recette concurrence', duration_minutes: 60, price_amount: 15000, currency: 'XOF', is_active: true }).select('id').single()).id;
  const day = new Date(Date.now() + 3 * 86400000); day.setUTCHours(10, 0, 0, 0);
  requireResult(await admin.from('availability_rules').insert({ provider_id: providerId, weekday: day.getUTCDay(), starts_at: '08:00', ends_at: '18:00', slot_interval_minutes: 30 }));
  const payload = (account, hour) => ({ client_id: account.id, provider_id: providerId, provider_service_id: serviceId, starts_at: new Date(day.getTime() + hour * 3600000).toISOString(), ends_at: new Date(day.getTime() + (hour + 1) * 3600000).toISOString(), status: 'pending', location_mode: 'salon', total_amount: 15000, currency: 'XOF' });
  for (const [label, actors, hour] of [['deux clients concurrents', [accounts[1], accounts[2]], 0], ['double requete du meme client', [accounts[1], accounts[1]], 2]]) {
    const results = await Promise.all(actors.map(account => account.api.from('bookings').insert(payload(account, hour)).select('id').single()));
    assert.equal(results.filter(result => !result.error).length, 1, `${label}: one winner required`);
    assert.equal(results.find(result => result.error)?.error.code, '23P01', `${label}: explicit slot conflict required`);
    const persisted = requireResult(await admin.from('bookings').select('id,client_id,total_amount').eq('provider_id', providerId).eq('starts_at', payload(actors[0], hour).starts_at));
    assert.equal(persisted.length, 1); assert.equal(persisted[0].total_amount, 15000);
    rows.push({ action: label, status: 'PASS', simultaneousRequests: 2, successes: 1, conflictCode: '23P01', persistedBookings: persisted.length });
  }
} catch (error) {
  rows.push({ action: 'recette concurrence', status: 'FAIL', error: error instanceof Error ? error.message : String(error?.message ?? error) });
  process.exitCode = 1;
} finally {
  if (providerId) requireResult(await admin.from('bookings').delete().eq('provider_id', providerId));
  if (serviceId) requireResult(await admin.from('provider_services').delete().eq('id', serviceId));
  for (const account of accounts.reverse()) { await account.api.auth.signOut({ scope: 'global' }); requireResult(await admin.auth.admin.deleteUser(account.id)); }
  await writeFile('work/final-audit/booking-concurrency.json', JSON.stringify({ date: new Date().toISOString(), backend: url, rows }, null, 2));
  console.log(JSON.stringify(rows));
}
