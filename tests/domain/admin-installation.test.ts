import { expect, it } from "vitest";
import clientManifest from "../../app/manifest";
import { GET } from "../../app/admin/manifest.webmanifest/route";
import { metadata } from "../../app/admin/layout";

it("installs admin with its own identity and launch target while retaining private metadata", async () => {
  const response = GET();
  const admin = await response.json();
  expect(response.headers.get("content-type")).toBe("application/manifest+json");
  expect(metadata.manifest).toBe("/admin/manifest.webmanifest");
  expect(metadata.robots).toMatchObject({ index: false, follow: false });
  expect(admin.id).not.toBe(clientManifest().id);
  expect(admin.start_url).toBe("/admin");
  expect(new URL(admin.start_url, "https://mata-beauty.com").pathname.startsWith(admin.scope)).toBe(true);
  expect(clientManifest().start_url).toBe("/");
});
