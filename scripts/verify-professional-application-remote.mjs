import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.REMOTE_SUPABASE_URL;
if (url !== 'https://kazlvtxkbsdhbfvtqqdp.supabase.co') throw new Error('This security workflow requires the QA project');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const users = [], paths = [], passed = [];
const check = result => { assert.ifError(result.error); return result.data; };
const record = title => { passed.push(title); console.log('PASS', title); };
async function account(label, metadata = {}) {
  const email = `codex-application-${label}-${randomUUID()}@example.test`, password = `QA-${randomUUID()}!`;
  const user = check(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Candidature QA', legal_accepted: true, ...metadata } })).user;
  users.push(user.id);
  const api = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY, options);
  check(await api.auth.signInWithPassword({ email, password }));
  check(await api.rpc('synchronize_account_status'));
  return { id: user.id, api };
}
async function document(owner, kind) {
  const path = `${owner.id}/${randomUUID()}.png`;
  check(await owner.api.storage.from('provider-documents').upload(path, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'), { contentType: 'image/png' }));
  paths.push(path);
  return check(await owner.api.from('provider_documents').insert({ provider_id: owner.id, kind, storage_path: path }).select('id,storage_path').single());
}
try {
  const owner = await account('owner', { professional_intent: true, role: 'admin', isSuperAdmin: true });
  check(await owner.api.rpc('request_provider_onboarding', { target_business_name: 'Candidature QA' }));
  const roles = check(await owner.api.from('account_roles').select('role').eq('profile_id', owner.id));
  check(await owner.api.rpc('save_professional_onboarding', { target_business_name: 'Candidature QA', target_bio: 'Présentation professionnelle de recette, suffisamment longue pour être validée.', target_city: 'Dakar', target_service_mode: 'salon', target_activity_type: 'independent', target_years_experience: 3, target_base_address: 'Adresse commerciale fictive QA', target_languages: ['Français'], target_cancellation_policy: 'Annulation autorisée avant le rendez-vous.' }));
  if (process.argv.includes('--baseline')) {
    const submit = await owner.api.rpc('submit_provider_for_review');
    console.log(JSON.stringify({ baseline: true, professionalRoleGrantedBeforeApproval: roles.some(row => row.role === 'professional'), submissionError: submit.error?.message ?? null }));
  } else {
    assert.equal(roles.some(row => row.role === 'professional'), false);
    assert.equal(check(await owner.api.from('profiles').select('role').eq('id', owner.id).single()).role, 'client');
    record('metadata and application cannot grant internal or professional roles');
    assert.ok((await owner.api.rpc('submit_provider_for_review')).error); record('four missing documents block submission');
    const identity = await document(owner, 'identity');
    await document(owner, 'business_registration'); await document(owner, 'qualification');
    assert.ok((await owner.api.rpc('submit_provider_for_review')).error); record('three documents still block submission');
    await document(owner, 'address_proof');
    const other = await account('other');
    assert.equal(check(await other.api.from('provider_documents').select('id').eq('provider_id', owner.id)).length, 0);
    assert.ok((await other.api.storage.from('provider-documents').createSignedUrl(identity.storage_path, 60)).error);
    const anon = createClient(url, process.env.REMOTE_SUPABASE_ANON_KEY, options);
    assert.ok((await anon.storage.from('provider-documents').createSignedUrl(identity.storage_path, 60)).error);
    record('other client and anonymous cannot read or sign private documents');
    assert.ok((await owner.api.from('provider_profiles').update({ status: 'approved' }).eq('profile_id', owner.id)).error);
    assert.ok((await owner.api.from('account_roles').insert({ profile_id: owner.id, role: 'professional' })).error);
    assert.ok((await owner.api.rpc('review_professional_application', { target_provider_id: owner.id, decision: 'approved', public_message: 'Forged approval' })).error);
    assert.ok((await owner.api.rpc('admin_set_provider_status', { target_provider_id: owner.id, next_status: 'draft', reason: 'Forged transition' })).error);
    record('forged approval, roles and administrative transitions rejected');
    check(await owner.api.rpc('submit_provider_for_review'));
    check(await owner.api.rpc('submit_provider_for_review'));
    assert.equal(check(await owner.api.from('professional_onboarding').select('status').eq('provider_id', owner.id).single()).status, 'submitted');
    assert.equal(check(await owner.api.from('account_roles').select('role').eq('profile_id', owner.id)).some(row => row.role === 'professional'), false);
    record('complete submission is idempotent and does not grant professional access');
    const agent = await account('agent');
    const role = check(await admin.from('admin_roles').select('id').eq('key', 'verification_agent').single());
    check(await admin.from('profiles').update({ role: 'admin' }).eq('id', agent.id));
    check(await admin.from('admin_user_roles').insert({ user_id: agent.id, role_id: role.id, assigned_by: agent.id, is_active: true }));
    const signed = check(await agent.api.storage.from('provider-documents').createSignedUrl(identity.storage_path, 60));
    assert.equal((await fetch(signed.signedUrl)).status, 200); record('authorized reviewer can actually open the private document');
    check(await agent.api.rpc('request_professional_document_update', { target_document_id: identity.id, public_message: 'Veuillez remplacer la pièce illisible.' }));
    assert.equal(check(await owner.api.from('professional_onboarding').select('status').eq('provider_id', owner.id).single()).status, 'additional_information_required');
    assert.ok(check(await owner.api.from('notifications').select('id').eq('profile_id', owner.id).eq('kind', 'professional_application')).length > 0);
    assert.ok((await owner.api.rpc('submit_provider_for_review')).error); record('complement changes candidate status, notifies, and prevents resubmitting rejected document');
    await document(owner, 'identity');
    check(await owner.api.rpc('submit_provider_for_review'));
    check(await agent.api.rpc('review_professional_application', { target_provider_id: owner.id, decision: 'approved', public_message: 'Vos quatre documents ont été vérifiés.' }));
    assert.equal(check(await owner.api.from('provider_profiles').select('status').eq('profile_id', owner.id).single()).status, 'approved');
    assert.ok(check(await owner.api.from('account_roles').select('role').eq('profile_id', owner.id)).some(row => row.role === 'professional'));
    assert.equal(check(await admin.from('payments').select('id,bookings!inner(provider_id)').eq('bookings.provider_id', owner.id)).length, 0);
    record('replacement, resubmission and authorized approval grant access without payment');
    console.log(JSON.stringify({ passed: passed.length }));
  }
} finally {
  if (paths.length) check(await admin.storage.from('provider-documents').remove(paths));
  if (users.length) {
    const docs = check(await admin.from('provider_documents').select('id').in('provider_id', users));
    if (docs.length) check(await admin.from('document_reviews').delete().in('document_id', docs.map(row => row.id)));
    check(await admin.from('provider_documents').delete().in('provider_id', users));
    for (const id of [...users].reverse()) check(await admin.auth.admin.deleteUser(id));
  }
  console.log('QA fixtures cleaned');
}
