import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplicationRole = "client" | "provider" | "admin";

export type AuthenticatedProfile = {
  userId: string;
  role: ApplicationRole;
  roles: ApplicationRole[];
  profileIncomplete: boolean;
};

type ProfileRow = {
  role: ApplicationRole;
  is_suspended: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

export async function loadAuthenticatedProfile(supabase: SupabaseClient, userId: string): Promise<AuthenticatedProfile> {
  const [{ data: profile, error: profileError }, { data: accountRoles, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("role,is_suspended,first_name,last_name,phone").eq("id", userId).single(),
    supabase.from("account_roles").select("role").eq("profile_id", userId),
  ]);
  if (profileError || !profile) throw profileError ?? new Error("Profil introuvable.");
  const row = profile as ProfileRow;
  if (row.is_suspended) throw new Error("Ce compte est suspendu. Contactez l’assistance Mata Beauty.");

  const roles = new Set<ApplicationRole>();
  for (const item of accountRoles ?? []) {
    if (item.role === "customer") roles.add("client");
    if (item.role === "professional") roles.add("provider");
  }
  if (row.role === "admin") roles.add("admin");
  if (!roles.size) roles.add(row.role === "provider" ? "provider" : "client");
  const orderedRoles = [...roles];
  const primaryRole = row.role === "admin" ? "admin" : row.role === "provider" && roles.has("provider") ? "provider" : "client";
  if (rolesError) throw rolesError;
  return {
    userId,
    role: primaryRole,
    roles: orderedRoles,
    profileIncomplete: !row.first_name || !row.last_name || !row.phone,
  };
}
