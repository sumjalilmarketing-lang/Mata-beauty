import { describe, expect, it } from "vitest";
import { availableWorkspaces, canAccessWorkspace, canAccessWorkspaceModule, type WorkspaceIdentity } from "../../lib/auth/workspace-access";
import { workspaceModule, workspaceNavigationModules, workspaceSpaces } from "../../lib/navigation/spaces";

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
    for (const space of Object.values(workspaceSpaces)) {
      const renderedShortcuts = space.navigation.flatMap((group) => group.items).filter((module) => module.primary).slice(0, 4);
      expect(renderedShortcuts.length, space.key).toBeLessThanOrEqual(4);
    }
  });

  it("uses a direct Dashboard followed by compact accordion groups", () => {
    for (const space of Object.values(workspaceSpaces)) {
      expect(space.navigation[0]).toMatchObject({ key: "dashboard", direct: true });
      expect(space.navigation.slice(1).every((group) => !group.direct && group.items.length > 0)).toBe(true);
    }
  });

  it("keeps every navigation route unique and connected to a real module surface", () => {
    for (const [spaceKey, space] of Object.entries(workspaceSpaces)) {
      const navigationKeys = space.navigation.flatMap((group) => group.items.map((item) => item.key));
      expect(new Set(navigationKeys).size, spaceKey).toBe(navigationKeys.length);
      for (const item of space.navigation.flatMap((group) => group.items)) {
        const resolved = workspaceModule(space.key, item.key);
        expect(resolved.key).toBe(item.key);
        expect(space.modules.some((module) => module.key === resolved.targetKey), `${spaceKey}/${item.key}`).toBe(true);
      }
      expect(workspaceNavigationModules(space.key)).toHaveLength(navigationKeys.length);
    }
  });

  it("separates identity, configuration and daily work in the main workspaces", () => {
    for (const key of ["client", "pro", "salon"] as const) {
      const labels = workspaceSpaces[key].navigation.map((group) => group.label);
      expect(labels).toContain("Paramètres");
      expect(labels.some((label) => label.toLocaleLowerCase("fr").includes("profil"))).toBe(true);
    }
    expect(workspaceSpaces.pro.navigation.map((group) => group.label)).toEqual(expect.arrayContaining(["Activité", "Relations", "Offre", "Contenu", "Finance", "Support"]));
  });

  it("inherits the permission of the functional target for navigation aliases", () => {
    const refundProcessing = workspaceModule("finance", "refunds-processing");
    expect(refundProcessing.targetKey).toBe("refunds");
    expect(refundProcessing.permission).toBe("payments.refund");
  });

  it("uses unique module keys in each space", () => {
    for (const space of Object.values(workspaceSpaces)) {
      const keys = space.modules.map((module) => module.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
