import { expect, it } from "vitest";
import clientManifest from "../../app/manifest";
import { GET } from "../../app/commercial/manifest.webmanifest/route";
import { metadata } from "../../app/commercial/layout";

it("installs a distinct commercial app with access to client routes in the same window", async () => {
  const response = GET();
  const manifest = await response.json();
  expect(metadata.manifest).toBe("/commercial/manifest.webmanifest");
  expect(metadata.robots).toMatchObject({ index: false, follow: false });
  expect(manifest.id).not.toBe(clientManifest().id);
  expect(manifest.start_url).toBe("/commercial");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(clientManifest().start_url).toBe("/");
});
