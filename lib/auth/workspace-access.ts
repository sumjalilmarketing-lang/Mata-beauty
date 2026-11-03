import type { ApplicationRole } from "./profile";
import type { AdminPermissionKey, AdminRoleKey } from "../domain/admin";
import { workspaceSpaces, type WorkspaceSpaceKey } from "../navigation/spaces";

export type WorkspaceIdentity = {
  applicationRoles: readonly ApplicationRole[];
  adminRoles: readonly AdminRoleKey[];
  permissions: readonly string[];
  staffPermissions: readonly string[];
  ownsBusiness: boolean;
  isCollaborator: boolean;
};

export function canAccessWorkspace(space: WorkspaceSpaceKey, identity: WorkspaceIdentity) {
  if (space === "client") return identity.applicationRoles.includes("client") || identity.adminRoles.some(role => ["commercial", "commercial_manager", "commercial_agent"].includes(role));
  if (space === "pro") return identity.applicationRoles.includes("provider");
  // A professional must be able to enter the Salon workspace to create their
  // first business. Row-level policies still restrict every existing salon to
  // its owner or authorised collaborators.
  if (space === "salon") return identity.applicationRoles.includes("provider");
  if (space === "staff") return identity.isCollaborator;
  const allowed = workspaceSpaces[space].allowedAdminRoles ?? [];
  return identity.adminRoles.some((role) => allowed.includes(role));
}

export function canAccessWorkspaceModule(identity: WorkspaceIdentity, permission?: AdminPermissionKey, staffPermission?: string) {
  if (staffPermission) return identity.staffPermissions.includes(staffPermission);
  if (!permission || identity.adminRoles.includes("super_admin")) return true;
  return identity.permissions.includes(permission);
}

export function availableWorkspaces(identity: WorkspaceIdentity): WorkspaceSpaceKey[] {
  return (Object.keys(workspaceSpaces) as WorkspaceSpaceKey[]).filter((space) => canAccessWorkspace(space, identity));
}

/** Internal roles use their own workspace, never the general administration UI. */
export function internalWorkspaceDestination(roles: readonly string[]): string | null {
  if (roles.includes("super_admin")) return "/admin";
  if (roles.some(role=>["hr_manager","hr_agent"].includes(role))) return "/admin/hr";
  if (roles.includes("admin")) return "/operations";
  if (roles.some(role => ["commercial", "commercial_manager", "commercial_agent"].includes(role))) return "/commercial";
  if (roles.includes("verification_agent")) return "/onboarding";
  if (roles.some(role => ["finance", "finance_manager", "finance_agent"].includes(role))) return "/finance";
  if (roles.some(role => ["support", "support_manager", "support_agent"].includes(role))) return "/support-agent";
  if (roles.includes("moderator")) return "/moderation";
  if (roles.includes("content_manager")) return "/operations";
  return null;
}
