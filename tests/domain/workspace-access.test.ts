import { describe, expect, it } from "vitest";
import { availableWorkspaces, canAccessWorkspace, canAccessWorkspaceModule, type WorkspaceIdentity } from "../../lib/auth/workspace-access";
import { workspaceSpaces } from "../../lib/navigation/spaces";

const base: WorkspaceIdentity = { applicationRoles: [], adminRoles: [], permissions: [], ownsBusiness: false, isCollaborator: false };

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
