export const adminRoleKeys = [
  "super_admin",
  "admin",
  "support",
  "moderator",
  "verification_agent",
  "commercial",
  "finance",
  "content_manager",
  "hr_manager", "hr_agent",
  "commercial_manager", "commercial_agent", "finance_manager", "finance_agent", "support_manager", "support_agent",
] as const;

export type AdminRoleKey = typeof adminRoleKeys[number];

export const adminPermissionKeys = [
  "hr.manage", "hr.cases",
  "users.read", "users.update", "users.suspend", "users.delete",
  "providers.read", "providers.verify", "providers.suspend",
  "bookings.read", "bookings.update",
  "payments.read", "payments.refund", "payouts.read", "commissions.manage", "payouts.manage",
  "reviews.moderate", "reports.manage", "categories.manage", "content.manage",
  "notifications.send", "settings.read", "settings.update", "roles.manage",
  "audit.read", "support.manage", "documents.review", "crm.manage", "teams.manage", "commercial.cases", "finance.cases", "support.cases",
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
  hr_manager: ["teams.manage", "hr.manage", "hr.cases"],
  hr_agent: ["hr.cases"],
  support_manager: ["teams.manage", "support.cases"],
  support_agent: ["support.cases"],
  commercial_manager: ["teams.manage", "crm.manage", "commercial.cases"],
  commercial_agent: ["crm.manage", "commercial.cases"],
  finance_manager: ["teams.manage", "payments.read", "payouts.read", "finance.cases"],
  finance_agent: ["finance.cases"],
  support: ["support.cases", "users.read", "bookings.read", "bookings.update", "support.manage"],
  moderator: ["users.read", "providers.read", "bookings.read", "reviews.moderate", "reports.manage"],
  verification_agent: ["users.read", "providers.read", "providers.verify", "documents.review"],
  commercial: ["commercial.cases", "providers.read", "providers.verify", "documents.review", "crm.manage"],
  finance: ["payouts.read", "finance.cases", "bookings.read", "payments.read", "payments.refund", "commissions.manage", "payouts.manage"],
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
