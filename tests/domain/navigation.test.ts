import { describe, expect, it } from "vitest";
import { navigationLabel, simpleNavigation, workspaceHref, workspaceSpaces } from "@/lib/navigation/spaces";

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
