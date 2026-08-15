import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.AUTH_DIAGNOSTIC_EMAIL?.trim().toLowerCase();
const repair = process.env.AUTH_DIAGNOSTIC_REPAIR === "true";

if (!url || !serviceRole || !email) {
  console.error("Variables requises : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et AUTH_DIAGNOSTIC_EMAIL.");
  process.exit(1);
}

const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (usersError) throw usersError;
const identity = users.users.find((user) => user.email?.toLowerCase() === email);
if (!identity) {
  console.log(JSON.stringify({ authUserExists: false }));
  process.exit(2);
}

let { data: profile } = await admin.from("profiles").select("id,role,is_suspended,account_status").eq("id", identity.id).maybeSingle();
if (!profile && repair) {
  const displayName = String(identity.user_metadata?.display_name || identity.user_metadata?.full_name || "Mata").slice(0, 80);
  const accountStatus = identity.email_confirmed_at ? "active" : "email_unverified";
  const { error } = await admin.from("profiles").insert({ id: identity.id, role: "client", display_name: displayName, account_status: accountStatus });
  if (error) throw error;
  await admin.from("client_profiles").upsert({ profile_id: identity.id }, { onConflict: "profile_id" });
  await admin.from("account_roles").upsert({ profile_id: identity.id, role: "customer" }, { onConflict: "profile_id,role" });
  ({ data: profile } = await admin.from("profiles").select("id,role,is_suspended,account_status").eq("id", identity.id).maybeSingle());
}

const [{ data: applicationRoles }, { data: adminRoles }, { count: businesses }, { count: collaborations }] = await Promise.all([
  admin.from("account_roles").select("role").eq("profile_id", identity.id),
  admin.from("admin_user_roles").select("admin_roles(key),is_active,requires_mfa").eq("user_id", identity.id),
  admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", identity.id),
  admin.from("collaborators").select("id", { count: "exact", head: true }).eq("profile_id", identity.id).eq("is_active", true),
]);

console.log(JSON.stringify({
  authUserExists: true,
  emailConfirmed: Boolean(identity.email_confirmed_at),
  profileExists: Boolean(profile),
  profileRole: profile?.role ?? null,
  accountStatus: profile?.account_status ?? null,
  suspended: profile?.is_suspended ?? null,
  applicationRoleCount: applicationRoles?.length ?? 0,
  activeAdminRoleCount: adminRoles?.filter((role) => role.is_active).length ?? 0,
  ownsBusiness: (businesses ?? 0) > 0,
  isCollaborator: (collaborations ?? 0) > 0,
  repaired: repair && Boolean(profile),
}, null, 2));
