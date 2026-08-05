import type { ApplicationRole } from "./profile";
import type { AdminPermissionKey, AdminRoleKey } from "../domain/admin";
import { workspaceSpaces, type WorkspaceSpaceKey } from "../navigation/spaces";

export type WorkspaceIdentity = {
  applicationRoles: readonly ApplicationRole[];
  adminRoles: readonly AdminRoleKey[];
  permissions: readonly string[];
  ownsBusiness: boolean;
  isCollaborator: boolean;
};

export function canAccessWorkspace(space: WorkspaceSpaceKey, identity: WorkspaceIdentity) {
  if (space === "client") return identity.applicationRoles.includes("client");
  if (space === "pro") return identity.applicationRoles.includes("provider");
  if (space === "salon") return identity.applicationRoles.includes("provider") && identity.ownsBusiness;
  if (space === "staff") return identity.isCollaborator;
  const allowed = workspaceSpaces[space].allowedAdminRoles ?? [];
  return identity.adminRoles.some((role) => allowed.includes(role));
}

export function canAccessWorkspaceModule(identity: WorkspaceIdentity, permission?: AdminPermissionKey) {
  if (!permission || identity.adminRoles.includes("super_admin")) return true;
  return identity.permissions.includes(permission);
}

export function availableWorkspaces(identity: WorkspaceIdentity): WorkspaceSpaceKey[] {
  return (Object.keys(workspaceSpaces) as WorkspaceSpaceKey[]).filter((space) => canAccessWorkspace(space, identity));
}
