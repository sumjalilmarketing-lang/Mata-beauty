import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url&&anonKey&&serviceKey,"Remote Supabase credentials required");

const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const run=`${Date.now()}-${randomUUID().slice(0,6)}`;
const password=`Mata-Admin-Audit-${randomUUID()}!`;
const users=[];
const expectedPermissions={
  support:["users.read","bookings.read","bookings.update","reports.manage","support.manage"],
  verification_agent:["users.read","providers.read","providers.verify","documents.review"],
  finance:["bookings.read","payments.read","payments.refund","commissions.manage","payouts.manage","audit.read"],
};

function userClient(){return createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});}

async function makeUser(label,kind="client"){
  const email=`codex-admin-${label}-${run}@example.test`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Audit ${label}`,legal_accepted:"true"}});
  assert.ifError(created.error);
  const id=created.data.user.id;
  users.push(id);
  if(kind==="provider"){
    assert.ifError((await admin.from("profiles").update({role:"provider"}).eq("id",id)).error);
    assert.ifError((await admin.from("provider_profiles").insert({profile_id:id,business_name:`Audit Provider ${run}`,slug:`audit-provider-${run}`.toLowerCase(),status:"pending_review",city:"Dakar"})).error);
  }
  if(["support","verification_agent","finance","super_admin"].includes(kind)){
    const role=await admin.from("admin_roles").select("id").eq("key",kind).single();
    assert.ifError(role.error);
    assert.ifError((await admin.from("profiles").update({role:"admin",is_suspended:false}).eq("id",id)).error);
    assert.ifError((await admin.from("admin_user_roles").insert({user_id:id,role_id:role.data.id,assigned_by:id,requires_mfa:kind==="super_admin",is_active:true})).error);
  }
  const api=userClient();
  assert.ifError((await api.auth.signInWithPassword({email,password})).error);
  return{id,email,api,kind};
}

async function visibleCount(api,table,column,value){
  const result=await api.from(table).select(column).eq(column,value);
  assert.ifError(result.error);
  return result.data.length;
}

async function main(){
  const client=await makeUser("client");
  const provider=await makeUser("provider","provider");
  const support=await makeUser("support","support");
  const onboarding=await makeUser("onboarding","verification_agent");
  const finance=await makeUser("finance","finance");
  const superAdmin=await makeUser("super","super_admin");
  const probe=await makeUser("probe");
  assert.ifError((await admin.from("provider_profiles").insert({profile_id:probe.id,business_name:`Probe ${run}`,slug:`probe-${run}`.toLowerCase(),status:"pending_review",city:"Dakar"})).error);
  const auditProbe=await admin.from("audit_logs").insert({actor_id:superAdmin.id,action:`admin.audit_probe.${run}`,entity_type:"profiles",entity_id:probe.id,after_data:{run}}).select("id").single();
  assert.ifError(auditProbe.error);

  for(const actor of [client,provider]){
    const context=await actor.api.rpc("get_admin_context");
    assert.ifError(context.error);
    assert.equal(context.data,null,`${actor.kind} must not receive admin context`);
    assert.equal(await visibleCount(actor.api,"profiles","id",support.id),0,`${actor.kind} must not read staff profiles`);
    assert.equal(await visibleCount(actor.api,"audit_logs","id",auditProbe.data.id),0,`${actor.kind} must not read audit logs`);
    const escalation=await actor.api.from("profiles").update({role:"admin"}).eq("id",actor.id);
    assert.ok(escalation.error,`${actor.kind} role escalation must fail`);
  }

  for(const actor of [support,onboarding,finance]){
    const context=await actor.api.rpc("get_admin_context");
    assert.ifError(context.error);
    assert.deepEqual([...context.data.roles].sort(),[actor.kind].sort());
    assert.deepEqual([...context.data.permissions].sort(),[...expectedPermissions[actor.kind]].sort());
    assert.ifError((await actor.api.rpc("record_admin_session",{client_user_agent:`Mata audit ${run}`})).error);
    const ownSessions=await actor.api.from("admin_sessions").select("id,revoked_at").eq("user_id",actor.id);
    assert.ifError(ownSessions.error);
    assert.ok(ownSessions.data.length>0);
  }

  assert.equal(await visibleCount(support.api,"profiles","id",probe.id),1,"support can read users");
  assert.equal(await visibleCount(support.api,"provider_profiles","profile_id",probe.id),0,"support cannot read pending provider dossiers");
  assert.equal(await visibleCount(support.api,"audit_logs","id",auditProbe.data.id),0,"support cannot read audit logs");
  assert.ok((await support.api.rpc("admin_update_setting",{setting_key:"support-probe",setting_value:{run},reason:"must fail"})).error);

  assert.equal(await visibleCount(onboarding.api,"profiles","id",probe.id),1,"onboarding can read users");
  assert.equal(await visibleCount(onboarding.api,"provider_profiles","profile_id",probe.id),1,"onboarding can read pending providers");
  assert.equal(await visibleCount(onboarding.api,"audit_logs","id",auditProbe.data.id),0,"onboarding cannot read audit logs");
  const approved=await onboarding.api.rpc("admin_set_provider_status",{target_provider_id:probe.id,next_status:"approved",reason:`Onboarding audit ${run}`});
  assert.ifError(approved.error);
  assert.equal((await admin.from("provider_profiles").select("status").eq("profile_id",probe.id).single()).data.status,"approved");

  assert.equal(await visibleCount(finance.api,"profiles","id",support.id),0,"finance cannot read internal user profiles");
  assert.equal(await visibleCount(finance.api,"provider_profiles","profile_id",provider.id),0,"finance cannot read pending providers");
  assert.equal(await visibleCount(finance.api,"audit_logs","id",auditProbe.data.id),1,"finance can read audit logs");
  const financeUsers=await finance.api.rpc("admin_list_users",{search_term:null});
  assert.ifError(financeUsers.error);
  assert.equal(financeUsers.data.length,0,"finance cannot list users");

  const superContext=await superAdmin.api.rpc("get_admin_context");
  assert.ifError(superContext.error);
  assert.equal(superContext.data.is_super_admin,true);
  assert.ok(superContext.data.permissions.includes("roles.manage"));
  assert.equal(await visibleCount(superAdmin.api,"profiles","id",probe.id),1);
  assert.equal(await visibleCount(superAdmin.api,"provider_profiles","profile_id",provider.id),1);
  assert.equal(await visibleCount(superAdmin.api,"audit_logs","id",auditProbe.data.id),1);
  assert.ifError((await superAdmin.api.rpc("record_admin_session",{client_user_agent:`Mata audit ${run}`})).error);
  assert.ifError((await superAdmin.api.rpc("admin_assign_role",{target_user_id:probe.id,target_role_key:"support",reason:`Role audit ${run}`})).error);
  const roleAudit=await admin.from("audit_logs").select("id").eq("actor_id",superAdmin.id).eq("action","admin.role_assigned").contains("after_data",{justification:`Role audit ${run}`});
  assert.ifError(roleAudit.error);
  assert.equal(roleAudit.data.length,1,"sensitive role assignment must be audited");

  for(const actor of [support,onboarding,finance,superAdmin]){
    assert.ifError((await actor.api.rpc("close_admin_session")).error);
    const closed=await admin.from("admin_sessions").select("revoked_at").eq("user_id",actor.id).not("revoked_at","is",null);
    assert.ifError(closed.error);
    assert.ok(closed.data.length>0,"admin sign-out must close its session");
  }

  console.log(JSON.stringify({ok:true,roles:["client","provider","support","onboarding","finance","super_admin"],authContext:true,granularPermissions:true,rlsAllowDeny:true,loginAudit:true,sensitiveActionAudit:true}));
}

try{await main();}finally{
  for(const id of users.reverse())await admin.auth.admin.deleteUser(id);
}
