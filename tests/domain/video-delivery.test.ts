import { describe, expect, it } from "vitest";
import { validatePublishedVideoDelivery, type PublishedVideoRecord } from "../../lib/domain/video-delivery";

const expected = { postId: "post-1", serviceId: "service-1", videoPath: "owner/post-1/video.mp4", thumbnailPath: "owner/post-1/thumbnail.jpg" };
const published: PublishedVideoRecord = {
  id: expected.postId,
  status: "published",
  visibility: "public",
  published_at: "2026-08-31T00:00:00.000Z",
  post_services: [{ provider_service_id: expected.serviceId, is_primary: true }],
  social_post_media: [{ bucket_id: "provider-social-media", storage_path: expected.videoPath, thumbnail_path: expected.thumbnailPath }],
};

describe("validatePublishedVideoDelivery", () => {
  it("accepte uniquement une publication publique, persistée et reliée à son média et sa prestation", () => {
    expect(validatePublishedVideoDelivery(published, expected)).toBeNull();
  });

  it.each<readonly [PublishedVideoRecord, string]>([
    [{ ...published, status: "draft" }, "état publiable"],
    [{ ...published, published_at: null }, "état publiable"],
    [{ ...published, post_services: [] }, "prestation"],
    [{ ...published, social_post_media: [] }, "média"],
  ])("refuse une livraison incomplète", (record, message) => {
    expect(validatePublishedVideoDelivery(record, expected)).toContain(message);
  });
});
