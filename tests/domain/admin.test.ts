import { describe, expect, it } from "vitest";
import {
  adminPermissionKeys,
  adminRoleKeys,
  canAssignAdminRole,
  canEscalateToSuperAdmin,
  defaultRolePermissions,
  requiresAdminReason,
  roleHasPermission,
} from "../../lib/domain/admin";

describe("Mata Beauty admin RBAC", () => {
  it("accorde toutes les permissions au Super Admin", () => {
    expect(defaultRolePermissions.super_admin).toEqual(adminPermissionKeys);
  });

  it.each(adminRoleKeys.filter((role) => role !== "super_admin"))("limite le rôle %s", (role) => {
    expect(defaultRolePermissions[role].length).toBeGreaterThan(0);
    expect(defaultRolePermissions[role].length).toBeLessThan(adminPermissionKeys.length);
  });

  it("réserve les opérations financières au rôle finance et au Super Admin", () => {
    expect(roleHasPermission("finance", "payments.refund")).toBe(true);
    expect(roleHasPermission("support", "payments.refund")).toBe(false);
    expect(roleHasPermission("super_admin", "payments.refund")).toBe(true);
  });

  it("empêche un administrateur de promouvoir son propre compte", () => {
    expect(canAssignAdminRole("super_admin", "user-a", "user-a")).toBe(false);
    expect(canEscalateToSuperAdmin("super_admin", "user-a", "user-a")).toBe(false);
  });

  it("empêche un admin standard de créer un Super Admin", () => {
    expect(canEscalateToSuperAdmin("admin", "user-a", "user-b")).toBe(false);
    expect(canAssignAdminRole("admin", "user-a", "user-b")).toBe(false);
  });

  it("autorise uniquement un Super Admin à attribuer un rôle à un autre compte", () => {
    expect(canAssignAdminRole("super_admin", "user-a", "user-b")).toBe(true);
  });

  it("exige un motif pour chaque action sensible", () => {
    expect(requiresAdminReason("user.suspended")).toBe(true);
    expect(requiresAdminReason("provider.status_changed")).toBe(true);
    expect(requiresAdminReason("setting.updated")).toBe(true);
    expect(requiresAdminReason("users.read")).toBe(false);
  });
});
