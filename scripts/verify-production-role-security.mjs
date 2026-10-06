import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const url=process.env.REMOTE_SUPABASE_URL, key=process.env.REMOTE_SUPABASE_ANON_KEY;
if(url!=='https://kazlvtxkbsdhbfvtqqdp.supabase.co' && !(url==='https://qjdwxdbvrxedyfolnpol.supabase.co' && process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com')) throw new Error('Explicit production acceptance authorization required');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const accounts=[], rows=[]; const run=randomUUID();
const record=(actor,action,pass,detail)=>rows.push({actor,action,status:pass?'PASS':'FAIL',detail});
try {
for(const kind of ['client','provider','super_admin','revoked_admin','ordinary_admin']) {
 const password=`QA-${randomUUID()}!`,email=`codex-security-${kind}-${run}@example.test`;
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});if(made.error)throw made.error;
 const id=made.data.user.id; const api=createClient(url,key,{auth:{persistSession:false}});accounts.push({id,api,kind});
 await admin.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',id);
 if(kind==='provider') {const p=await admin.from('provider_profiles').insert({profile_id:id,business_name:`Security QA ${run}`,slug:`security-${run}`,city:'Dakar',status:'draft'});if(p.error)throw p.error;const u=await admin.from('provider_profiles').update({status:'approved'}).eq('profile_id',id);if(u.error)throw u.error;}
 if(kind==='super_admin') {const r=await admin.from('admin_roles').select('id').eq('key',kind).single();await admin.from('profiles').update({role:'admin'}).eq('id',id);const m=await admin.from('admin_user_roles').insert({user_id:id,role_id:r.data.id,assigned_by:id,requires_mfa:true,is_active:true});if(m.error)throw m.error;}
 if(kind==='revoked_admin') {const r=await admin.from('admin_roles').select('id').eq('key','super_admin').single();await admin.from('profiles').update({role:'admin'}).eq('id',id);const m=await admin.from('admin_user_roles').insert({user_id:id,role_id:r.data.id,assigned_by:id,requires_mfa:false,is_active:true});if(m.error)throw m.error;}
 if(kind==='ordinary_admin') {const role=await admin.from('admin_roles').select('id').eq('key','admin').single();if(role.error)throw role.error;await admin.from('profiles').update({role:'admin'}).eq('id',id);const m=await admin.from('admin_user_roles').insert({user_id:id,role_id:role.data.id,assigned_by:id,requires_mfa:false,is_active:true});if(m.error)throw m.error;}
 const login=await api.auth.signInWithPassword({email,password});if(login.error)throw login.error;
 if(kind==='ordinary_admin') {
  for(const permission of ['reports.manage','users.suspend']) if((await api.rpc('has_admin_permission',{required_permission:permission})).data!==true)throw new Error('Fixture missing required permission');
  const target=accounts.find(account=>account.kind==='super_admin').id;
  const report=await admin.from('reports').insert({reporter_id:id,reported_profile_id:target,reason:'autre',details:'Recette protection Super Admin'}).select('id').single();if(report.error)throw report.error;
  try {const attempt=await api.rpc('manage_moderation_report',{target_report_id:report.data.id,target_action:'suspend',target_reason:'Recette refus obligatoire'});const actual=await admin.from('profiles').select('is_suspended').eq('id',target).single();record(kind,'Moderation ne contourne pas protection Super Admin',!!attempt.error&&actual.data.is_suspended===false,{error:attempt.error?.code??null,suspended:actual.data.is_suspended});}
  finally {await admin.from('reports').delete().eq('id',report.data.id);}
  continue;
 }
 if(kind==='revoked_admin') { const before=await api.rpc('is_admin'); if(before.data!==true)throw new Error('Revocation fixture was not active'); const revoked=await admin.from('admin_user_roles').update({is_active:false,revoked_at:new Date().toISOString()}).eq('user_id',id);if(revoked.error)throw revoked.error;const after=await api.rpc('is_admin');record(kind,'Session existante : permissions retirees apres revocation',after.data===false,{grantedAfterRevocation:after.data});continue;}
 if(kind==='super_admin') {const context=await api.rpc('get_admin_context');const permissions=await api.rpc('has_admin_permission',{required_permission:'roles.manage'});record(kind,'MFA exigé : refuser permission roles.manage à AAL1',permissions.data!==true,{permissionGranted:permissions.data,requiresMfa:context.data?.requires_mfa});continue;}
 const context=await api.rpc('get_admin_context');record(kind,'Contexte administratif refusé',context.data===null,{error:context.error?.code??null});
 for(const role of ['provider','professional','admin','super_admin']) {const original=await admin.from('profiles').select('role').eq('id',id).single(); const x=await api.from('profiles').update({role}).eq('id',id);const after=await admin.from('profiles').select('role').eq('id',id).single();record(kind,`Auto-attribution profiles.role=${role}`,after.data.role===original.data.role,{error:x.error?.code??null});}
 for(const role of ['professional','admin','super_admin']){const x=await api.from('account_roles').insert({profile_id:id,role});record(kind,`Insertion account_roles=${role}`,!!x.error,{error:x.error?.code??null});}
 const x=await api.rpc('admin_assign_role',{target_user_id:id,target_role_key:'super_admin',reason:'Recette refus obligatoire'});record(kind,'RPC attribution Super Admin refusée',!!x.error,{error:x.error?.code??null});
 const metadata=await api.auth.updateUser({data:{role:'super_admin',approvalStatus:'approved'}});if(metadata.error)throw metadata.error;await api.auth.refreshSession();const metaContext=await api.rpc('get_admin_context');record(kind,'Métadonnées utilisateur ne confèrent pas de droits',metaContext.data===null,{});
 if(kind==='client') {await admin.from('provider_profiles').insert({profile_id:id,business_name:'Candidate Security',slug:'candidate-'+id,city:'Dakar',status:'draft'});const s=await api.from('provider_profiles').update({status:'approved'}).eq('profile_id',id);const actual=await admin.from('provider_profiles').select('status').eq('profile_id',id).single();record(kind,'Auto-approbation professionnelle refusée',actual.data.status!=='approved',{error:s.error?.code??null,status:actual.data.status});}
}
} finally {for(const {id,api} of accounts.reverse()){await api.auth.signOut({scope:'global'});const del=await admin.auth.admin.deleteUser(id);if(del.error)rows.push({action:'cleanup',status:'FAIL',detail:del.error.message});}await writeFile('work/final-audit/final-role-security.json',JSON.stringify({date:new Date().toISOString(),backend:url,rows},null,2));console.log(JSON.stringify(rows,null,2));if(rows.some(row=>row.status==='FAIL'))process.exitCode=1;}


