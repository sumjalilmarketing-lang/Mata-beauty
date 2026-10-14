import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshFeedPostMedia, resolvePrivateMedia, type SocialFeedRow } from "../../lib/supabase/social-media";

const mocks = vi.hoisted(() => ({ browserClient: vi.fn(), signer: vi.fn() }));
vi.mock("../../lib/supabase/client", () => ({
  getSupabaseBrowserClient: mocks.browserClient,
  getSupabasePublicMediaClient: () => ({ storage: { from: () => ({ createSignedUrl: mocks.signer }) } }),
}));

const row: SocialFeedRow = {
  id: "post-1", author_id: "provider-1", caption: "Style", video_url: "https://storage.test/expired.mp4", thumbnail_url: null,
  duration_seconds: 12, view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0,
  published_at: "2026-10-14T10:00:00.000Z", business_name: "Salon", slug: "salon", city: "Dakar", verified_at: null,
  avatar_url: null, cover_url: null, is_sponsored: false, provider_service_id: "service-1", service_title: "Tresses",
  duration_minutes: 90, price_amount: 12500, currency: "XOF", average_rating: 0, review_count: 0,
  media_items: [{ media_type: "video", bucket_id: "provider-social-media", storage_path: "provider/post/video.mp4", thumbnail_path: null }],
};

beforeEach(() => { vi.resetAllMocks(); });

describe("private feed media", () => {
  it("re-signs private media when a feed item is explicitly retried", async () => {
    mocks.signer.mockResolvedValue({ data: { signedUrl: "https://storage.test/fresh.mp4" }, error: null });
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    mocks.browserClient.mockReturnValue({ from: vi.fn(() => query) });

    const refreshed = await refreshFeedPostMedia(row.id);

    expect(refreshed?.video_url).toBe("https://storage.test/fresh.mp4");
    expect(query.eq).toHaveBeenCalledWith("id", row.id);
    expect(mocks.signer).toHaveBeenCalledWith("provider/post/video.mp4", 3600);
  });

  it("fails closed when Storage refuses a private media signature", async () => {
    mocks.signer.mockResolvedValue({ data: null, error: { message: "not authorized" } });
    await expect(resolvePrivateMedia(row)).resolves.toBeNull();
  });

  it("leaves public or legacy media records unchanged", async () => {
    const publicRow = { ...row, media_items: [] };
    await expect(resolvePrivateMedia(publicRow)).resolves.toBe(publicRow);
    expect(mocks.signer).not.toHaveBeenCalled();
  });
});
