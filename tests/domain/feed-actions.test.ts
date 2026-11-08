import { expect, it } from "vitest";
import { feedProfilePath } from "../../lib/domain/feed-profile-path";
import { studioServiceCanPublish, studioServiceIsPublic } from "../../lib/domain/studio-booking";

it("opens author profiles independently of booking catalogue membership", () => {
  expect(feedProfilePath({ authorId: "owner", slug: "coiffeuse" })).toBe("/professional/coiffeuse");
  expect(feedProfilePath({ authorId: "owner" })).toBe("/professional/owner");
  expect(feedProfilePath({ authorId: "owner", slug: "coiffeuse", businessSlug: "salon" })).toBe("/salons/salon");
  expect(feedProfilePath({ authorId: "owner", slug: "a/b?x=1" })).toBe("/professional/a%2Fb%3Fx%3D1");
});

it("requires a published active service for booking, including legacy inconsistent drafts", () => {
  const service = { id: "service", status: "published", is_active: true, archived_at: null };
  expect(studioServiceIsPublic(service)).toBe(true);
  for (const other of [undefined, { ...service, status: "draft" }, { ...service, is_active: false }, { ...service, archived_at: "2026-11-08" }]) {
    expect(studioServiceIsPublic(other)).toBe(false);
  }
  expect(studioServiceCanPublish({ ...service, status: "draft" })).toBe(true);
  expect(studioServiceCanPublish({ ...service, status: "draft", is_active: false })).toBe(true);
  expect(studioServiceCanPublish({ ...service, status: "paused" })).toBe(false);
  expect(studioServiceCanPublish({ ...service, status: "draft", archived_at: "2026-11-08" })).toBe(false);
});
