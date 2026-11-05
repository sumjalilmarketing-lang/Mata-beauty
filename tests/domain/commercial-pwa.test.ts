import { describe, expect, it } from "vitest";
import { GET } from "../../app/commercial/manifest.webmanifest/route";
import manifest from "../../app/manifest";
import { metadata } from "../../app/commercial/layout";

describe("commercial installation", () => {
  it("launches the commercial workspace with a separate installation identity", async () => {
    const response = GET();
    const commercial = await response.json();
    expect(response.headers.get("Content-Type")).toBe("application/manifest+json");
    expect(commercial.id).toBe("/commercial");
    expect(commercial.start_url).toBe("/commercial");
    expect(commercial.id).not.toBe(manifest().id);
    expect(manifest().start_url).toBe("/");
    expect(commercial.scope).toBe("/");
    expect(commercial.shortcuts.map((item: { url: string }) => item.url)).toEqual(["/commercial", "/commercial/crm", "/commercial/field", "/commercial/dossiers", "/"]);
  });
  it("advertises the commercial manifest and iPhone home-screen title", () => {
    expect(metadata.manifest).toBe("/commercial/manifest.webmanifest");
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "Mata Commercial" });
  });
});
