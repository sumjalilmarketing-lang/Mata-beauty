import { describe, expect, it, vi } from "vitest";
import { deferPrivateVideoUntilActive, fetchPublicPostVideoMedia, fetchPublicPostVideoResult, postUsesVideoMedia } from "@/lib/domain/public-post-video-media";

const postId = "d0dde438-b0c5-463a-bcd7-99e606dca7ef";

describe("fetchPublicPostVideoMedia", () => {
  it("keeps private photos and carousels out of the video-only endpoint", () => {
    expect(postUsesVideoMedia("photo", ["image", "image", "image"])).toBe(false);
    expect(postUsesVideoMedia("before_after", ["before", "after"])).toBe(false);
    expect(postUsesVideoMedia("video", ["video"])).toBe(true);
    expect(postUsesVideoMedia(undefined, [])).toBe(true);
  });

  it("defers signed private video URLs until the video becomes active", () => {
    const row = { post_type: "video", video_url: "https://private.example/video", thumbnail_url: "https://private.example/poster", media_urls: ["https://private.example/video"], media_items: [{ bucket_id: "social-videos", media_type: "video" }] };
    expect(deferPrivateVideoUntilActive(row)).toMatchObject({ video_url: "", thumbnail_url: null, media_urls: [] });
  });

  it("defers unclassified videos and keeps photo media unchanged", () => {
    const unclassifiedVideo = { video_url: "https://private.example/video", thumbnail_url: null, media_items: [] };
    const photoRow = { post_type: "photo", video_url: "https://private.example/photo", thumbnail_url: null, media_items: [{ bucket_id: "provider-social-media", media_type: "photo" }] };
    expect(deferPrivateVideoUntilActive(unclassifiedVideo)).toMatchObject({ video_url: "", thumbnail_url: null, media_urls: [] });
    expect(deferPrivateVideoUntilActive(photoRow)).toBe(photoRow);
  });

  it("distinguishes a withdrawn publication from a recoverable outage", async () => {
    const removed = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 404 }));
    const outage = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 }));
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    await expect(fetchPublicPostVideoResult(postId, removed)).resolves.toEqual({ status: "not_found" });
    await expect(fetchPublicPostVideoResult(postId, outage)).resolves.toEqual({ status: "unavailable" });
    await expect(fetchPublicPostVideoResult(postId, offline)).resolves.toEqual({ status: "unavailable" });
  });
  it("requests a fresh URL for the exact public post without browser storage access", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      videoUrl: "https://storage.example.test/signed/video.mp4?token=fresh",
      thumbnailUrl: "https://storage.example.test/signed/cover.jpg?token=fresh",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(fetchPublicPostVideoMedia(postId, fetcher)).resolves.toEqual({
      videoUrl: "https://storage.example.test/signed/video.mp4?token=fresh",
      thumbnailUrl: "https://storage.example.test/signed/cover.jpg?token=fresh",
    });
    expect(fetcher).toHaveBeenCalledWith(`/api/public/social-posts/${postId}/media`, expect.objectContaining({ cache: "no-store" }));
  });

  it("rejects malformed identifiers and unsafe URLs", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchPublicPostVideoMedia("not-a-uuid", fetcher)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();

    const unsafeFetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ videoUrl: "javascript:alert(1)" }), { status: 200 }));
    await expect(fetchPublicPostVideoMedia(postId, unsafeFetcher)).resolves.toBeNull();
  });

  it("returns null for unavailable or failed signing requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(fetchPublicPostVideoMedia(postId, fetcher)).resolves.toBeNull();
    const failingFetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("network"));
    await expect(fetchPublicPostVideoMedia(postId, failingFetcher)).resolves.toBeNull();
  });
});
