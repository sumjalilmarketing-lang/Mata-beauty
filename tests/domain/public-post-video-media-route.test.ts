import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/public/social-posts/[id]/media/route";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

const postId = "d0dde438-b0c5-463a-bcd7-99e606dca7ef";
const videoPath = "e4de61bf-a273-418e-8e74-1a6cf96c87d2/posts/sample.mp4";
const thumbnailPath = "e4de61bf-a273-418e-8e74-1a6cf96c87d2/posts/sample.jpg";
const post = {
  video_url: `https://qjdwxdbvrxedyfolnpol.supabase.co/storage/v1/object/public/provider-social-media/${videoPath}`,
  thumbnail_url: `https://qjdwxdbvrxedyfolnpol.supabase.co/storage/v1/object/public/provider-social-media/${thumbnailPath}`,
  post_type: "video",
  media_items: [{ bucket_id: "provider-social-media", media_type: "video", storage_path: videoPath, thumbnail_path: thumbnailPath }],
};

class QueryBuilder {
  readonly select = vi.fn(() => this);
  readonly eq = vi.fn(() => this);
  readonly maybeSingle: ReturnType<typeof vi.fn>;

  constructor(data: unknown, error: unknown) {
    this.maybeSingle = vi.fn().mockResolvedValue({ data, error });
  }
}

function clientFor(input: { data: unknown; error?: unknown; signingError?: unknown }) {
  const query = new QueryBuilder(input.data, input.error ?? null);
  const createSignedUrl = vi.fn(async (path: string, _expiresIn: number) => ({
    data: { signedUrl: `https://qjdwxdbvrxedyfolnpol.supabase.co/storage/v1/object/sign/provider-social-media/${path === videoPath ? "video-token" : "thumbnail-token"}` },
    error: path === videoPath ? input.signingError ?? null : null,
  }));
  const storageFrom = vi.fn(() => ({ createSignedUrl }));
  const from = vi.fn(() => query);
  mocks.createClient.mockReturnValue({ from, storage: { from: storageFrom } });
  return { query, createSignedUrl, storageFrom };
}

function request(id = postId) {
  return GET(new Request(`https://preview.example/api/public/social-posts/${id}/media`), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://qjdwxdbvrxedyfolnpol.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.resetAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("public post video URL renewal", () => {
  it("signs only media belonging to a public feed post with the public key", async () => {
    const db = clientFor({ data: post });
    const response = await request();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      videoUrl: `https://qjdwxdbvrxedyfolnpol.supabase.co/storage/v1/object/sign/provider-social-media/video-token`,
      thumbnailUrl: `https://qjdwxdbvrxedyfolnpol.supabase.co/storage/v1/object/sign/provider-social-media/thumbnail-token`,
    });
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://qjdwxdbvrxedyfolnpol.supabase.co",
      "test-public-anon-key",
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    expect(db.storageFrom).toHaveBeenCalledWith("provider-social-media");
    expect(db.createSignedUrl).toHaveBeenNthCalledWith(1, videoPath, 3600);
    expect(db.createSignedUrl).toHaveBeenNthCalledWith(2, thumbnailPath, 3600);
    expect(db.query.eq).toHaveBeenNthCalledWith(1, "id", postId);
    expect(db.query.eq).toHaveBeenNthCalledWith(2, "post_type", "video");
  });

  it("does not sign a post hidden from the public feed", async () => {
    const db = clientFor({ data: null });
    const response = await request();

    expect(response.status).toBe(404);
    expect(db.createSignedUrl).not.toHaveBeenCalled();
  });

  it("fails closed when the public Storage policy rejects a signed URL", async () => {
    const db = clientFor({ data: post, signingError: { message: "internal storage detail" } });
    const response = await request();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(db.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("does not construct a Supabase client when the Preview public variables are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const response = await request();

    expect(response.status).toBe(503);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
