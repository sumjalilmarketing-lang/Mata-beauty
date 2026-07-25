export const adminRoleKeys = [
  "super_admin",
  "admin",
  "support",
  "moderator",
  "verification_agent",
  "finance",
  "content_manager",
] as const;

export type AdminRoleKey = typeof adminRoleKeys[number];

export const adminPermissionKeys = [
  "users.read", "users.update", "users.suspend", "users.delete",
  "providers.read", "providers.verify", "providers.suspend",
  "bookings.read", "bookings.update",
  "payments.read", "payments.refund", "commissions.manage", "payouts.manage",
  "reviews.moderate", "reports.manage", "categories.manage", "content.manage",
  "notifications.send", "settings.read", "settings.update", "roles.manage",
  "audit.read", "support.manage", "documents.review",
] as const;

export type AdminPermissionKey = typeof adminPermissionKeys[number];

export const defaultRolePermissions: Record<AdminRoleKey, readonly AdminPermissionKey[]> = {
  super_admin: adminPermissionKeys,
  admin: [
    "users.read", "users.update", "users.suspend", "providers.read", "providers.verify", "providers.suspend",
    "bookings.read", "bookings.update", "payments.read", "reviews.moderate", "reports.manage",
    "categories.manage", "content.manage", "notifications.send", "settings.read", "audit.read",
    "support.manage", "documents.review",
  ],
  support: ["users.read", "bookings.read", "bookings.update", "reports.manage", "support.manage"],
  moderator: ["users.read", "providers.read", "bookings.read", "reviews.moderate", "reports.manage"],
  verification_agent: ["users.read", "providers.read", "providers.verify", "documents.review"],
  finance: ["bookings.read", "payments.read", "payments.refund", "commissions.manage", "payouts.manage", "audit.read"],
  content_manager: ["providers.read", "categories.manage", "content.manage", "notifications.send", "settings.read"],
};

export function roleHasPermission(role: AdminRoleKey, permission: AdminPermissionKey) {
  return defaultRolePermissions[role].includes(permission);
}

export function canAssignAdminRole(actorRole: AdminRoleKey, actorId: string, targetId: string) {
  return actorRole === "super_admin" && actorId !== targetId;
}

export function canEscalateToSuperAdmin(actorRole: AdminRoleKey, actorId: string, targetId: string) {
  return actorRole === "super_admin" && actorId !== targetId;
}

export const auditedAdminActions = [
  "admin.role_assigned",
  "user.suspended",
  "user.reactivated",
  "provider.status_changed",
  "booking.status_changed",
  "setting.updated",
] as const;

export function requiresAdminReason(action: string) {
  return (auditedAdminActions as readonly string[]).includes(action);
}
