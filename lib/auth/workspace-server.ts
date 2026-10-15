import { notFound, redirect } from "next/navigation";
import { ensureAuthenticatedProfile } from "@/lib/auth/profile";
import type { AdminRoleKey } from "@/lib/domain/admin";
import { workspaceModule, workspaceSpaces, type WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { createSupabasePageClient } from "@/lib/supabase/server";
import { availableWorkspaces, canAccessWorkspace, canAccessWorkspaceModule, type WorkspaceIdentity } from "./workspace-access";

type AdminContext = { roles?: string[]; permissions?: string[] };
type CollaboratorAccess = { business_id: string; collaborator_id: string; internal_role: string; permissions: string[] };

export async function requireWorkspace(space: WorkspaceSpaceKey, moduleKey: string) {
  const supabase = await createSupabasePageClient();
  const { data: { user } } = await supabase.auth.getUser();
  const requestedPath = moduleKey === "dashboard" ? workspacePath(space) : `${workspacePath(space)}/${moduleKey}`;
  if (!user) redirect(`/?connexion=requise&returnTo=${encodeURIComponent(requestedPath)}`);

  const profile = await ensureAuthenticatedProfile(supabase, user.id).catch(() => null);
  if (!profile) redirect("/?auth_error=profile_creation_failed");
  const collaboratorAccessEnabled = process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED === "true";
  const [adminResult, ownedResult, collaboratorResult, providerResult] = await Promise.all([
    supabase.rpc("get_admin_context"),
    supabase.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    collaboratorAccessEnabled ? supabase.rpc("current_collaborator_access") : Promise.resolve({ data: [], error: null }),
    supabase.from("provider_profiles").select("status").eq("profile_id", user.id).maybeSingle(),
  ]);
  const admin = (adminResult.data ?? {}) as AdminContext;
  const collaboratorAccess = (collaboratorResult.error ? [] : collaboratorResult.data ?? []) as CollaboratorAccess[];
  const staffPermissions = [...new Set(collaboratorAccess.flatMap((membership) => membership.permissions ?? []))];
  const identity: WorkspaceIdentity = {
    applicationRoles: profile.roles,
    adminRoles: (admin.roles ?? []) as AdminRoleKey[],
    permissions: admin.permissions ?? [],
    staffPermissions,
    ownsBusiness: (ownedResult.count ?? 0) > 0,
    isCollaborator: staffPermissions.length > 0,
  };
  if (["pro", "salon"].includes(space) && providerResult.data?.status !== "approved") redirect("/app/application");
  if (!canAccessWorkspace(space, identity)) redirect(`/?acces=refuse&returnTo=${encodeURIComponent(requestedPath)}`);
  if (!workspaceSpaces[space].modules.some((item) => item.key === moduleKey)) notFound();
  const currentModule = workspaceModule(space, moduleKey);
  if (!canAccessWorkspaceModule(identity, currentModule.permission, currentModule.staffPermission)) {
    if (space === "staff") {
      const firstAllowed = workspaceSpaces.staff.modules.find((item) => item.staffPermission && canAccessWorkspaceModule(identity, undefined, item.staffPermission));
      if (firstAllowed) redirect(firstAllowed.key === "dashboard" ? workspacePath(space) : `${workspacePath(space)}/${firstAllowed.key}`);
    }
    redirect(workspaceModule(space, "dashboard").key === currentModule.key ? "/" : workspacePath(space));
  }
  return { identity, module: currentModule, availableSpaces: availableWorkspaces(identity), userEmail: user.email ?? "Compte Mata Beauty", userId: user.id, providerApproved: providerResult.data?.status === "approved" };
}

function workspacePath(space: WorkspaceSpaceKey) {
  const prefixes: Record<WorkspaceSpaceKey, string> = { client: "/app", pro: "/pro", salon: "/salon", staff: "/staff", onboarding: "/onboarding", support: "/support-agent", moderation: "/moderation", finance: "/finance", operations: "/operations", admin: "/admin" };
  return prefixes[space];
}
