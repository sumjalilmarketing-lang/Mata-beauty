import { describe, expect, it } from "vitest";
import { availableWorkspaces, internalWorkspaceDestination, canAccessWorkspace, canAccessWorkspaceModule, type WorkspaceIdentity } from "../../lib/auth/workspace-access";
import { workspaceSpaces } from "../../lib/navigation/spaces";

const base: WorkspaceIdentity = { applicationRoles: [], adminRoles: [], permissions: [], staffPermissions: [], ownsBusiness: false, isCollaborator: false };

describe("workspace access matrix", () => {
  it("separates client, professional, salon owner and staff capabilities", () => {
    expect(canAccessWorkspace("client", { ...base, applicationRoles: ["client"] })).toBe(true);
    expect(canAccessWorkspace("pro", { ...base, applicationRoles: ["provider"] })).toBe(true);
    expect(canAccessWorkspace("salon", { ...base, applicationRoles: ["client"] })).toBe(false);
    expect(canAccessWorkspace("salon", { ...base, applicationRoles: ["provider"] })).toBe(true);
    expect(canAccessWorkspace("salon", { ...base, applicationRoles: ["provider"], ownsBusiness: true })).toBe(true);
    expect(canAccessWorkspace("staff", { ...base, isCollaborator: true })).toBe(true);
  });

  it("only exposes internal spaces assigned to an agent role", () => {
    const finance = { ...base, applicationRoles: ["admin"] as const, adminRoles: ["finance"] as const, permissions: ["payments.read"] };
    expect(availableWorkspaces(finance)).toContain("finance");
    expect(availableWorkspaces(finance)).not.toContain("admin");
    expect(availableWorkspaces(finance)).not.toContain("support");
    expect(canAccessWorkspaceModule(finance, "payments.read")).toBe(true);
    expect(canAccessWorkspaceModule(finance, "payments.refund")).toBe(false);
  });

  it("gives super administrators their configured internal spaces and permission bypass", () => {
    const superAdmin = { ...base, applicationRoles: ["admin"] as const, adminRoles: ["super_admin"] as const };
    expect(canAccessWorkspace("admin", superAdmin)).toBe(true);
    expect(canAccessWorkspaceModule(superAdmin, "roles.manage")).toBe(true);
  });

  it("limits staff routes to explicitly granted permissions", () => {
    const staff = { ...base, isCollaborator: true, staffPermissions: ["messages.read"] };
    expect(canAccessWorkspaceModule(staff, undefined, "messages.read")).toBe(true);
    expect(canAccessWorkspaceModule(staff, undefined, "messages.reply")).toBe(false);
    const staffDashboardPermission = workspaceSpaces.staff.modules.find((module) => module.key === "dashboard")?.staffPermission;
    expect(staffDashboardPermission).toBe("bookings.read");
    expect(canAccessWorkspaceModule(staff, undefined, staffDashboardPermission)).toBe(false);
  });
});

describe("workspace navigation", () => {
  it("keeps mobile primary navigation to four modules plus More", () => {
    for (const space of Object.values(workspaceSpaces)) expect(space.modules.filter((module) => module.primary).length).toBeLessThanOrEqual(5);
  });

  it("uses unique module keys in each space", () => {
    for (const space of Object.values(workspaceSpaces)) {
      const keys = space.modules.map((module) => module.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});


describe("department isolation", () => {
  it.each([['commercial','commercial'],['finance','finance'],['support','support']] as const)("keeps %s in its department", (role, space) => {
    const identity = { ...base, applicationRoles: ['admin'] as const, adminRoles: [role] };
    expect(availableWorkspaces(identity)).toEqual(space === "commercial" ? ["client", space] : [space]);
    for (const other of ['admin','commercial','finance','support','operations'] as const) {
      expect(canAccessWorkspace(other,identity)).toBe(other === space);
    }
  });
  it("routes staff after MFA without exposing the super administration", () => {
    expect(internalWorkspaceDestination(['commercial'])).toBe('/commercial');
    expect(internalWorkspaceDestination(['finance'])).toBe('/finance');
    expect(internalWorkspaceDestination(['support'])).toBe('/support-agent');
    expect(internalWorkspaceDestination(['verification_agent'])).toBe('/onboarding');
    expect(internalWorkspaceDestination(['super_admin'])).toBe('/admin');
    expect(internalWorkspaceDestination(['unknown'])).toBeNull();
  });
});

import{defaultRolePermissions}from "../../lib/domain/admin";
it("isolates six delegated roles and prevents agent team/global administration",()=>{for(const department of["commercial","finance","support"]as const)for(const suffix of["manager","agent"]as const){const role=`${department}_${suffix}`as const,identity={...base,applicationRoles:["admin"]as const,adminRoles:[role],permissions:defaultRolePermissions[role]};expect(availableWorkspaces(identity)).toEqual(department === "commercial" ? ["client", department] : [department]);expect(internalWorkspaceDestination([role])).toBe(department==="support"?"/support-agent":`/${department}`);expect(canAccessWorkspaceModule(identity,"teams.manage")).toBe(suffix==="manager");expect(canAccessWorkspaceModule(identity,"roles.manage")).toBe(false);}expect(defaultRolePermissions.finance_agent).toEqual(["finance.cases"]);expect(defaultRolePermissions.finance_manager).not.toContain("payments.refund");});
