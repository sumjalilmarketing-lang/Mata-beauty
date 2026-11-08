import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/studio/validate-video/route";
import { InvalidStudioMedia, MAX_STUDIO_VIDEO_BYTES } from "../../lib/media/video-validation-server";

const mocks = vi.hoisted(() => ({
  origin: vi.fn(), auth: vi.fn(), quota: vi.fn(), service: vi.fn(),
  decode: vi.fn(), thumbnail: vi.fn(), fetch: vi.fn(),
}));
vi.mock("@/lib/payments/server", () => ({
  hasTrustedOrigin: mocks.origin, authenticatedSupabase: mocks.auth,
  consumeRateLimit: mocks.quota, serviceSupabase: mocks.service,
  jsonError: (message: string, status: number, code: string) => Response.json({ error: code, message }, { status }),
}));
vi.mock("@/lib/media/video-validation-server", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/media/video-validation-server")>(),
  validateVideoBytes: mocks.decode, validateThumbnailBytes: mocks.thumbnail,
}));

const owner = "c0b86893-d374-438d-a7fb-d00aa2b4d936";
const postId = "5b60a75f-075a-48a7-bc03-4216bcd17413";
const videoPath = `${owner}/${postId}/video.mov`;
const thumbnailPath = `${owner}/${postId}/thumbnail.jpg`;
const updatedAt = "2026-11-08T10:00:00Z";
const videoObject = "0ea18719-9655-4534-8228-97df3dd9ded0";
const thumbnailObject = "a6b727ed-c4e4-4eef-8c6f-9417463fd02d";
const video = new Uint8Array([1, 2, 3, 4]);
const thumbnail = new Uint8Array([5, 6, 7]);

function request(body: unknown = { postId, videoPath, thumbnailPath }) {
  return POST(new Request("https://app.example/api/studio/validate-video", {
    method: "POST", headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}
function setup() {
  const profile = vi.fn().mockResolvedValue({ data: { is_suspended: false, account_status: "active" }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: { profile_id: owner }, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const createSignedUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.example/storage/v1/object/sign/provider-social-media/${path}?token=fixture` }, error: null }));
  const storageFrom = vi.fn(() => ({ createSignedUrl }));
  mocks.auth.mockResolvedValue({ user: { id: owner }, client: { rpc: profile, from, storage: { from: storageFrom } } });
  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
    if (name === "get_studio_upload_snapshot") return { data: {
      id: params.target_path === videoPath ? videoObject : thumbnailObject,
      updated_at: updatedAt, size: params.target_path === videoPath ? video.length : thumbnail.length,
    }, error: null };
    return { data: true, error: null };
  });
  mocks.service.mockReturnValue({ rpc });
  mocks.fetch.mockImplementation(async (url: URL) => new Response(url.pathname.endsWith("video.mov") ? video : thumbnail));
  return { profile, maybeSingle, eq, from, storageFrom, createSignedUrl, rpc };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.origin.mockReturnValue(true);
  mocks.quota.mockResolvedValue(true);
  mocks.decode.mockResolvedValue({ duration: 12.5, aspectRatio: 0.5625, sha256: "video-fixture-hash" });
  mocks.thumbnail.mockResolvedValue("thumbnail-fixture-hash");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Studio server video validation", () => {
  it("rejects an untrusted origin before authenticating or reading Storage", async () => {
    setup(); mocks.origin.mockReturnValue(false);
    expect((await request()).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("requires verified authentication", async () => {
    setup(); mocks.auth.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["{broken", { postId: "invalid", videoPath, thumbnailPath }, { postId, videoPath, thumbnailPath, owner }])("rejects malformed input without downloading (%j)", async body => {
    setup();
    expect((await request(body)).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each([
    { videoPath: videoPath.replace(owner, "831c3713-2bd2-493a-aad1-55eecf1e9aa3") },
    { thumbnailPath: `${owner}/${postId}/../thumbnail.jpg` },
    { videoPath: `${owner}/${postId}/video.mp4/other` },
  ])("rejects paths outside the caller's exact upload slots (%j)", async paths => {
    const db = setup();
    expect((await request({ postId, videoPath, thumbnailPath, ...paths })).status).toBe(403);
    expect(db.profile).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each([{ is_suspended: true, account_status: "active" }, { is_suspended: false, account_status: "deleted" }, null])("rejects inactive profiles (%j)", async data => {
    const db = setup(); db.profile.mockResolvedValue({ data, error: null });
    expect((await request()).status).toBe(403);
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("requires a professional profile", async () => {
    const db = setup(); db.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(403);
    expect(db.eq).toHaveBeenCalledWith("profile_id", owner);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each([1, 2])("fails closed when quota %i rejects the operation", async deniedCall => {
    setup(); mocks.quota.mockImplementation(async () => mocks.quota.mock.calls.length !== deniedCall);
    expect((await request()).status).toBe(429);
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.decode).not.toHaveBeenCalled();
  });
  it("rejects an oversized Storage snapshot before signing or fetching", async () => {
    const db = setup();
    db.rpc.mockResolvedValue({ data: { id: videoObject, updated_at: updatedAt, size: MAX_STUDIO_VIDEO_BYTES + 1 }, error: null });
    expect((await request()).status).toBe(422);
    expect(db.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails closed on a Storage download error and conceals internal details", async () => {
    const db = setup(); mocks.fetch.mockRejectedValue(new Error("private-storage-internal-detail"));
    const response = await request();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private-storage-internal-detail");
    expect(mocks.decode).not.toHaveBeenCalled();
    expect(db.rpc.mock.calls.every(([name]) => name === "get_studio_upload_snapshot")).toBe(true);
  });
  it("rejects truncated bytes before decoding or attesting", async () => {
    const db = setup(); mocks.fetch.mockImplementation(async () => new Response(new Uint8Array([1])));
    expect((await request()).status).toBe(422);
    expect(mocks.decode).not.toHaveBeenCalled();
    expect(db.rpc.mock.calls.every(([name]) => name === "get_studio_upload_snapshot")).toBe(true);
  });
  it("does not fetch signed URLs pointing outside configured Storage", async () => {
    const db = setup(); db.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://attacker.example/video.mov" }, error: null });
    expect((await request()).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects failed video decoding without writing attestations", async () => {
    const db = setup(); mocks.decode.mockRejectedValue(new InvalidStudioMedia("Vidéo illisible."));
    expect((await request()).status).toBe(422);
    expect(mocks.thumbnail).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
  it("fails closed when the thumbnail attestation cannot be committed", async () => {
    const db = setup();
    const initial = db.rpc.getMockImplementation()!;
    db.rpc.mockImplementation(async (name, params) => name === "attest_studio_upload" && params.target_media_type === "thumbnail"
      ? { data: false, error: null } : initial(name, params));
    const response = await request();
    expect(response.status).toBe(503);
    expect((await response.json()).ok).toBeUndefined();
  });
  it("decodes downloaded bytes and attests both exact object snapshots before success", async () => {
    const db = setup(); const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duration: 12.5, aspectRatio: 0.5625 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.quota).toHaveBeenNthCalledWith(1, { scope: "studio_video_validation", key: owner, limit: 10, windowSeconds: 3600 });
    expect(mocks.quota).toHaveBeenNthCalledWith(2, { scope: "studio_video_validation", key: "global", limit: 300, windowSeconds: 3600 });
    expect(db.storageFrom).toHaveBeenCalledWith("provider-social-media");
    expect(db.createSignedUrl).toHaveBeenNthCalledWith(1, videoPath, 300);
    expect(db.createSignedUrl).toHaveBeenNthCalledWith(2, thumbnailPath, 300);
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(URL), { signal: expect.any(AbortSignal), redirect: "error" });
    expect(mocks.decode).toHaveBeenCalledWith(Buffer.from(video));
    expect(mocks.thumbnail).toHaveBeenCalledWith(Buffer.from(thumbnail));
    expect(db.rpc).toHaveBeenNthCalledWith(1, "get_studio_upload_snapshot", { target_owner: owner, target_path: videoPath });
    expect(db.rpc).toHaveBeenNthCalledWith(3, "attest_studio_upload", {
      target_owner: owner, target_path: videoPath, target_object_id: videoObject, target_updated_at: updatedAt,
      target_size: video.length, target_sha256: "video-fixture-hash", target_media_type: "video", target_duration: 12.5, target_aspect_ratio: 0.5625,
    });
    expect(db.rpc).toHaveBeenNthCalledWith(4, "attest_studio_upload", {
      target_owner: owner, target_path: thumbnailPath, target_object_id: thumbnailObject, target_updated_at: updatedAt,
      target_size: thumbnail.length, target_sha256: "thumbnail-fixture-hash", target_media_type: "thumbnail", target_duration: null, target_aspect_ratio: null,
    });
  });
});
