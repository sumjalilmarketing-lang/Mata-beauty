import { describe, expect, it } from "vitest";
import { GET as client } from "../../app/app/manifest.webmanifest/route";
import { GET as pro } from "../../app/pro/manifest.webmanifest/route";
import { GET as salon } from "../../app/salon/manifest.webmanifest/route";
import { GET as staff } from "../../app/staff/manifest.webmanifest/route";
import { GET as finance } from "../../app/finance/manifest.webmanifest/route";
import { GET as support } from "../../app/support-agent/manifest.webmanifest/route";
import { GET as onboarding } from "../../app/onboarding/manifest.webmanifest/route";
import { GET as moderation } from "../../app/moderation/manifest.webmanifest/route";
import { GET as operations } from "../../app/operations/manifest.webmanifest/route";
import { GET as commercial } from "../../app/commercial/manifest.webmanifest/route";
import { GET as admin } from "../../app/admin/manifest.webmanifest/route";
import rootManifest from "../../app/manifest";
import { metadata as clientMetadata } from "../../app/app/layout";
import { metadata as proMetadata } from "../../app/pro/layout";
import { metadata as salonMetadata } from "../../app/salon/layout";
import { metadata as staffMetadata } from "../../app/staff/layout";
import { metadata as financeMetadata } from "../../app/finance/layout";
import { metadata as supportMetadata } from "../../app/support-agent/layout";
import { metadata as onboardingMetadata } from "../../app/onboarding/layout";
import { metadata as moderationMetadata } from "../../app/moderation/layout";
import { metadata as operationsMetadata } from "../../app/operations/layout";

const entries = [
  ["/app", client, clientMetadata], ["/pro", pro, proMetadata],
  ["/salon", salon, salonMetadata], ["/staff", staff, staffMetadata],
  ["/finance", finance, financeMetadata], ["/support-agent", support, supportMetadata],
  ["/onboarding", onboarding, onboardingMetadata], ["/moderation", moderation, moderationMetadata],
  ["/operations", operations, operationsMetadata],
] as const;

describe("each workspace has its own phone installation", () => {
  it.each(entries)("%s launches its own workspace and advertises it on iPhone", async (prefix, get, metadata) => {
    const response = get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json");
    const manifest = await response.json();
    expect(manifest.id).toBe(prefix);
    expect(manifest.start_url).toBe(prefix);
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toContain("/brand/icon-192.png");
    expect(metadata.manifest).toBe(`${prefix}/manifest.webmanifest`);
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: manifest.short_name });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
  it("keeps all workspace installations distinct from each other and the feed", async () => {
    const manifests = await Promise.all([...entries.map(([, get]) => get()), commercial(), admin()].map(response => response.json()));
    const ids = [rootManifest().id, ...manifests.map(manifest => manifest.id)];
    expect(new Set(ids).size).toBe(12);
    expect(rootManifest().start_url).toBe("/");
  });
});
