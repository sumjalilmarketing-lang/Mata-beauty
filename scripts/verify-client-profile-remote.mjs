import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url&&anonKey&&serviceKey,"Remote Supabase credentials required");
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const password=`Mata-Profile-${randomUUID()}!`, run=`${Date.now()}-${randomUUID().slice(0,6)}`, ids=[];
function client(){return createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});}
async function createUser(label){const email=`codex-profile-${label}-${run}@example.test`;const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Profil ${label}`,legal_accepted:"true"}});assert.ifError(made.error);ids.push(made.data.user.id);const api=client();assert.ifError((await api.auth.signInWithPassword({email,password})).error);return{id:made.data.user.id,api};}

async function main(){
  const owner=await createUser("owner"), outsider=await createUser("outsider");
  assert.ifError((await owner.api.rpc("initialize_client_control_center")).error);
  assert.ifError((await outsider.api.rpc("initialize_client_control_center")).error);
  const identity=await owner.api.rpc("update_client_identity",{target_first_name:"Aminata",target_last_name:"Fall",target_username:`aminata_${run.replaceAll('-','_')}`.slice(0,30),target_phone:"+221770000000",target_bio:"Passionnée de coiffures protectrices.",target_city:"Dakar",target_neighborhood:"Mermoz",target_locale:"fr-SN"});
  assert.ifError(identity.error);
  const own=await owner.api.from("profiles").select("username,phone,bio,role").eq("id",owner.id).single();assert.ifError(own.error);assert.equal(own.data.role,"client");
  const privateProfile=await outsider.api.from("profiles").select("phone,bio").eq("id",owner.id);assert.ifError(privateProfile.error);assert.equal(privateProfile.data.length,0);
  const duplicate=await outsider.api.rpc("update_client_identity",{target_first_name:"Autre",target_last_name:"Compte",target_username:own.data.username,target_phone:"",target_bio:"",target_city:"Dakar",target_neighborhood:"",target_locale:"fr-SN"});assert.ok(duplicate.error);
  const prefs=await owner.api.from("profile_preferences").upsert({profile_id:owner.id,favorite_categories:["Tresses","Locks"],budget_min:10000,budget_max:30000,radius_km:20,location_mode:"both"});assert.ifError(prefs.error);
  const privacy=await owner.api.from("profile_privacy_settings").upsert({profile_id:owner.id,profile_visibility:"limited",show_collections:false,show_follows:false});assert.ifError(privacy.error);
  const notifications=await owner.api.from("notification_preferences").upsert({profile_id:owner.id,promotions_in_app:false,promotions_email:false});assert.ifError(notifications.error);
  const foreignPrefs=await outsider.api.from("profile_preferences").select("*").eq("profile_id",owner.id);assert.equal(foreignPrefs.data.length,0);
  const foreignWrite=await outsider.api.from("profile_preferences").update({radius_km:200}).eq("profile_id",owner.id).select("profile_id");assert.ifError(foreignWrite.error);assert.equal(foreignWrite.data.length,0);
  const roleEscalation=await owner.api.from("profiles").update({role:"admin"}).eq("id",owner.id);assert.ok(roleEscalation.error);
  const collection=await owner.api.from("inspiration_collections").insert({owner_id:owner.id,name:"Privée",is_public:false}).select("id").single();assert.ifError(collection.error);
  const hiddenCollection=await outsider.api.from("inspiration_collections").select("id").eq("id",collection.data.id);assert.equal(hiddenCollection.data.length,0);
  const foreignAvatar=await outsider.api.storage.from("avatars").upload(`${owner.id}/intrusion.png`,new Blob(["x"],{type:"image/png"}),{contentType:"image/png"});assert.ok(foreignAvatar.error);
  const upgrade=await owner.api.rpc("request_provider_onboarding",{target_business_name:"Aminata Beauty"});assert.ifError(upgrade.error);
  const roles=await owner.api.from("account_roles").select("role").eq("profile_id",owner.id);assert.ok(roles.data.some(row=>row.role==="professional"));
  const deletion=await owner.api.rpc("request_account_deletion",{target_reason:"Test automatisé"});assert.ifError(deletion.error);assert.ok(deletion.data);
  const deletionVisible=await owner.api.from("account_deletion_requests").select("status").eq("id",deletion.data).single();assert.equal(deletionVisible.data.status,"requested");
  console.log(JSON.stringify({ok:true,identityOwnUpdate:true,usernameUnique:true,privateProfileHidden:true,preferencesPrivate:true,crossWriteBlocked:true,roleEscalationBlocked:true,privateCollectionHidden:true,avatarIsolation:true,sameAccountProfessionalUpgrade:true,deletionRequestControlled:true}));
}
try{await main();}finally{for(const id of ids.reverse())await admin.auth.admin.deleteUser(id);}
