import { notFound, redirect } from "next/navigation";
import { ensureAuthenticatedProfile } from "@/lib/auth/profile";
import type { AdminRoleKey } from "@/lib/domain/admin";
import { workspaceModule, workspaceSpaces, type WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { createSupabasePageClient } from "@/lib/supabase/server";
import { availableWorkspaces, canAccessWorkspace, canAccessWorkspaceModule, type WorkspaceIdentity } from "./workspace-access";

type AdminContext = { roles?: string[]; permissions?: string[] };

export async function requireWorkspace(space: WorkspaceSpaceKey, moduleKey: string) {
  const supabase = await createSupabasePageClient();
  const { data: { user } } = await supabase.auth.getUser();
  const requestedPath = moduleKey === "dashboard" ? workspacePath(space) : `${workspacePath(space)}/${moduleKey}`;
  if (!user) redirect(`/?connexion=requise&returnTo=${encodeURIComponent(requestedPath)}`);

  const profile = await ensureAuthenticatedProfile(supabase, user.id).catch(() => null);
  if (!profile) redirect("/?auth_error=profile_creation_failed");
  const [adminResult, ownedResult, collaboratorResult, providerResult] = await Promise.all([
    supabase.rpc("get_admin_context"),
    supabase.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    supabase.rpc("current_collaborator_access"),
    supabase.from("provider_profiles").select("status").eq("profile_id", user.id).maybeSingle(),
  ]);
  const collaboratorAccess = (Array.isArray(collaboratorResult.data) ? collaboratorResult.data[0] : null) as
    | { business_id: string; staff_permissions: string[]; internal_role: string; collaborator_id: string }
    | null;
  const admin = (adminResult.data ?? {}) as AdminContext;
  const identity: WorkspaceIdentity = {
    applicationRoles: profile.roles,
    adminRoles: (admin.roles ?? []) as AdminRoleKey[],
    permissions: admin.permissions ?? [],
    ownsBusiness: (ownedResult.count ?? 0) > 0,
    isCollaborator: Boolean(collaboratorAccess),
    staffPermissions: Array.isArray(collaboratorAccess?.staff_permissions) ? collaboratorAccess.staff_permissions.filter((permission): permission is string => typeof permission === "string") : [],
  };
  if (["pro", "salon"].includes(space) && providerResult.data?.status !== "approved") redirect("/app/application");
  if (!canAccessWorkspace(space, identity)) redirect(`/?acces=refuse&returnTo=${encodeURIComponent(requestedPath)}`);
  if (!workspaceSpaces[space].modules.some((item) => item.key === moduleKey)) notFound();
  const currentModule = workspaceModule(space, moduleKey);
  if (!canAccessWorkspaceModule(identity, currentModule.permission, space, currentModule.staffPermission)) redirect(workspaceModule(space, "dashboard").key === currentModule.key ? "/" : workspacePath(space));
  return { identity, module: currentModule, availableSpaces: availableWorkspaces(identity), userEmail: user.email ?? "Compte Mata Beauty", userId: user.id, staffBusinessId: collaboratorAccess?.business_id ?? null, providerApproved: providerResult.data?.status === "approved" };
}

function workspacePath(space: WorkspaceSpaceKey) {
  const prefixes: Record<WorkspaceSpaceKey, string> = { client: "/app", pro: "/pro", salon: "/salon", staff: "/staff", onboarding: "/onboarding", support: "/support-agent", moderation: "/moderation", finance: "/finance", operations: "/operations", admin: "/admin" };
  return prefixes[space];
}
