import { describe, expect, it, vi } from "vitest";
import { fetchPublicPostVideoMedia } from "@/lib/domain/public-post-video-media";

const postId = "d0dde438-b0c5-463a-bcd7-99e606dca7ef";

describe("fetchPublicPostVideoMedia", () => {
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
