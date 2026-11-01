import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.REMOTE_SUPABASE_URL;
if (url !== 'https://kazlvtxkbsdhbfvtqqdp.supabase.co') throw new Error('QA only');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY, options);
const check = result => { assert.ifError(result.error); return result.data; };
const email = `codex-welcome-${randomUUID()}@example.test`, password = `QA-${randomUUID()}!`;
let id;
try {
  id = check(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { legal_accepted: true } })).user.id;
  assert.equal(check(await admin.from('welcome_email_deliveries').select('status').eq('user_id', id).single()).status, 'pending');
  assert.ok((await client.from('welcome_email_deliveries').select('*')).error);
  assert.ok((await client.rpc('claim_welcome_email', { target_user_id: id })).error);
  check(await client.auth.signInWithPassword({ email, password }));
  check(await client.rpc('synchronize_account_status'));
  assert.ok((await client.from('welcome_email_deliveries').update({ status: 'sent' }).eq('user_id', id)).error);
  assert.ok((await client.rpc('claim_welcome_email', { target_user_id: id })).error);
  const claims = await Promise.all([admin.rpc('claim_welcome_email', { target_user_id: id }), admin.rpc('claim_welcome_email', { target_user_id: id })]);
  assert.equal(claims.flatMap(check).length, 1);
  check(await admin.from('welcome_email_deliveries').update({ status: 'sent' }).eq('user_id', id));
  assert.deepEqual(check(await admin.rpc('claim_welcome_email', { target_user_id: id })), []);
  check(await admin.from('welcome_email_deliveries').update({ status: 'sending', first_attempt_at: new Date(Date.now()-24*3600*1000).toISOString() }).eq('user_id', id));
  assert.deepEqual(check(await admin.rpc('claim_welcome_email', { target_user_id: id })), []);
  assert.equal(check(await admin.from('welcome_email_deliveries').select('status').eq('user_id', id).single()).status, 'needs_review');
  console.log('PASS: new-account queue, anonymous and client isolation, concurrent claim, sent deduplication, expired ambiguous retry blocked');
} finally {
  if (id) check(await admin.auth.admin.deleteUser(id));
}
