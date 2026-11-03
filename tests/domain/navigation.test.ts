import { describe, expect, it } from "vitest";
import { normalizeWorkspaceModule, navigationLabel, simpleNavigation, workspaceHref, workspaceSpaces } from "@/lib/navigation/spaces";

describe("client discovery navigation", () => {
  it("keeps Inspiration as the only discovery entry in the primary navigation", () => {
    expect(simpleNavigation.client).toEqual(["feed", "bookings", "messages", "profile"]);
    expect(workspaceSpaces.client.modules.some((item) => item.key === "discover")).toBe(false);
    expect(navigationLabel("client", workspaceSpaces.client.modules.find((item) => item.key === "feed")!)).toBe("Inspiration");
  });

  it("keeps the legacy discovery URL available for redirects", () => {
    expect(workspaceHref("client", "discover")).toBe("/discover");
  });
});

describe("legacy workspace routes", () => {
  it.each(["client", "pro", "salon"] as const)("opens account settings for an old %s menu bookmark", space => {
    expect(normalizeWorkspaceModule(space, "menu")).toBe("settings");
    expect(workspaceSpaces[space].modules.some(item => item.key === normalizeWorkspaceModule(space, "menu"))).toBe(true);
  });
  it("keeps professional account settings separate from the public profile", () => {
    expect(normalizeWorkspaceModule("pro", "settings")).toBe("settings");
    expect(normalizeWorkspaceModule("pro", "public-profile")).toBe("public-profile");
    expect(normalizeWorkspaceModule("pro", "studio")).toBe("videos");
  });
});
