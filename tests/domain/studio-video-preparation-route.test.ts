import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/studio/prepare-video/route";
import { InvalidStudioMedia, MAX_STUDIO_VIDEO_BYTES } from "../../lib/media/video-validation-server";

const mocks = vi.hoisted(() => ({ origin: vi.fn(), auth: vi.fn(), quota: vi.fn(), service: vi.fn(), normalize: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/payments/server", () => ({
  hasTrustedOrigin: mocks.origin, authenticatedSupabase: mocks.auth, consumeRateLimit: mocks.quota, serviceSupabase: mocks.service,
  jsonError: (message: string, status: number, code: string) => Response.json({ error: code, message }, { status }),
}));
vi.mock("@/lib/media/video-validation-server", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/media/video-validation-server")>(),
  normalizeStudioVideo: mocks.normalize,
}));

const owner = "c0b86893-d374-438d-a7fb-d00aa2b4d936";
const preparationId = "5b60a75f-075a-48a7-bc03-4216bcd17413";
const sourcePath = `${owner}/${preparationId}/input`;
const videoPath = `${owner}/${preparationId}/video.mp4`;
const bytes = new Uint8Array([1, 2, 3, 4]);
const normalized = { video: Buffer.from([5, 6, 7]), thumbnail: Buffer.from([8, 9]), duration: 14.5, aspectRatio: 0.5625 };
const sourceUrl = `https://storage.example/storage/v1/object/sign/studio-video-inputs/${sourcePath}?token=fixture`;
const previewUrl = `https://storage.example/storage/v1/object/sign/provider-social-media/${videoPath}?token=fixture`;

function request(body: unknown = { preparationId }) {
  return POST(new Request("https://app.example/api/studio/prepare-video", {
    method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}
function setup() {
  const profile = vi.fn().mockResolvedValue({ data: { is_suspended: false, account_status: "active" }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: { profile_id: owner }, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
  const source = {
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: sourceUrl }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const output = {
    upload: vi.fn().mockResolvedValue({ data: { path: videoPath }, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: previewUrl }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const storageFrom = vi.fn((bucket: string) => {
    if (bucket === "studio-video-inputs") return source;
    if (bucket === "provider-social-media") return output;
    throw new Error("Unexpected bucket");
  });
  mocks.auth.mockResolvedValue({ user: { id: owner }, client: { rpc: profile, from, storage: { from: storageFrom } } });
  const rpc = vi.fn().mockResolvedValue({ data: { id: "0ea18719-9655-4534-8228-97df3dd9ded0", updated_at: "2026-11-08T10:00:00Z", size: bytes.length }, error: null });
  mocks.service.mockReturnValue({ rpc });
  return { profile, maybeSingle, eq, source, output, storageFrom, rpc };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.origin.mockReturnValue(true);
  mocks.quota.mockResolvedValue(true);
  mocks.normalize.mockResolvedValue(normalized);
  mocks.fetch.mockImplementation(async () => new Response(bytes));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Studio server video preparation", () => {
  it("rejects untrusted origins before authentication or Storage access", async () => {
    const db = setup(); mocks.origin.mockReturnValue(false);
    expect((await request()).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(db.storageFrom).not.toHaveBeenCalled();
  });
  it("requires a verified user before preparing any video", async () => {
    const db = setup(); mocks.auth.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(db.storageFrom).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each(["{broken", { preparationId: "../another-owner" }, { preparationId, sourcePath: "another-owner/input" }, { preparationId, owner: "another-owner" }])("rejects malformed or caller-supplied ownership/path fields (%j)", async body => {
    const db = setup();
    expect((await request(body)).status).toBe(400);
    expect(db.profile).not.toHaveBeenCalled();
    expect(db.storageFrom).not.toHaveBeenCalled();
  });
  it("bounds request bytes before parsing even without Content-Length", async () => {
    const db = setup();
    expect((await request(JSON.stringify({ preparationId, padding: "x".repeat(2000) }))).status).toBe(413);
    expect(db.storageFrom).not.toHaveBeenCalled();
  });
  it.each([{ is_suspended: true, account_status: "active" }, { is_suspended: false, account_status: "deleted" }, null])("rejects inactive profiles (%j)", async data => {
    const db = setup(); db.profile.mockResolvedValue({ data, error: null });
    expect((await request()).status).toBe(403);
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(db.storageFrom).not.toHaveBeenCalled();
  });
  it("requires a professional profile belonging to the authenticated user", async () => {
    const db = setup(); db.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(403);
    expect(db.eq).toHaveBeenCalledWith("profile_id", owner);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it.each([1, 2])("does not download or transcode when quota %i is exhausted", async deniedCall => {
    const db = setup(); mocks.quota.mockImplementation(async () => mocks.quota.mock.calls.length !== deniedCall);
    expect((await request()).status).toBe(429);
    expect(db.storageFrom).not.toHaveBeenCalled();
    expect(mocks.normalize).not.toHaveBeenCalled();
  });
  it("rejects oversized snapshots before signing and removes the owner-scoped source", async () => {
    const db = setup(); db.rpc.mockResolvedValue({ data: { id: "0ea18719-9655-4534-8228-97df3dd9ded0", updated_at: "2026-11-08T10:00:00Z", size: MAX_STUDIO_VIDEO_BYTES + 1 }, error: null });
    expect((await request()).status).toBe(422);
    expect(db.source.createSignedUrl).not.toHaveBeenCalled();
    expect(db.source.remove).toHaveBeenCalledWith([sourcePath]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("cleans the source after read errors without exposing internal details", async () => {
    const db = setup(); mocks.fetch.mockRejectedValue(new Error("internal-private-storage-message"));
    const response = await request();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("internal-private-storage-message");
    expect(db.source.remove).toHaveBeenCalledWith([sourcePath]);
    expect(db.output.upload).not.toHaveBeenCalled();
    expect(mocks.normalize).not.toHaveBeenCalled();
  });
  it("rejects incomplete downloads and cleans the source before transcoding", async () => {
    const db = setup(); mocks.fetch.mockImplementation(async () => new Response(new Uint8Array([1])));
    expect((await request()).status).toBe(422);
    expect(db.source.remove).toHaveBeenCalledWith([sourcePath]);
    expect(mocks.normalize).not.toHaveBeenCalled();
  });
  it("does not fetch a source signed by an unexpected Storage origin", async () => {
    const db = setup(); db.source.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://attacker.example/source" }, error: null });
    expect((await request()).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(db.source.remove).toHaveBeenCalledWith([sourcePath]);
  });
  it.each([new InvalidStudioMedia("Vidéo illisible."), new Error("Transcoder unavailable")])("cleans the source when transcoding fails (%s)", async error => {
    const db = setup(); mocks.normalize.mockRejectedValue(error);
    expect((await request()).status).toBe(error instanceof InvalidStudioMedia ? 422 : 503);
    expect(db.source.remove).toHaveBeenCalledWith([sourcePath]);
    expect(db.output.upload).not.toHaveBeenCalled();
    expect(db.output.remove).not.toHaveBeenCalled();
  });
  it("cleans the source and uploaded output when preview signing fails", async () => {
    const db = setup(); db.output.createSignedUrl.mockResolvedValue({ data: null, error: { message: "signing unavailable" } });
    expect((await request()).status).toBe(503);
    expect(db.source.remove).toHaveBeenCalledWith([sourcePath]);
    expect(db.output.remove).toHaveBeenCalledWith([videoPath]);
  });
  it("does not claim success when output upload fails", async () => {
    const db = setup(); db.output.upload.mockResolvedValue({ data: null, error: { message: "upload unavailable" } });
    expect((await request()).status).toBe(503);
    expect(db.output.createSignedUrl).not.toHaveBeenCalled();
    expect(db.source.remove).toHaveBeenCalledWith([sourcePath]);
  });
  it("generates all paths from verified UID, uploads with user-scoped Storage and returns a signed preview", async () => {
    const db = setup(); const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, postId: preparationId, videoPath, previewUrl, duration: 14.5, aspectRatio: 0.5625, thumbnail: normalized.thumbnail.toString("base64") });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("get_studio_source_snapshot", { target_owner: owner, target_path: sourcePath });
    expect(mocks.quota).toHaveBeenNthCalledWith(1, { scope: "studio_video_preparation", key: owner, limit: 10, windowSeconds: 3600 });
    expect(mocks.quota).toHaveBeenNthCalledWith(2, { scope: "studio_video_preparation", key: "global", limit: 300, windowSeconds: 3600 });
    expect(db.source.createSignedUrl).toHaveBeenCalledWith(sourcePath, 300);
    expect(mocks.fetch).toHaveBeenCalledWith(new URL(sourceUrl), { redirect: "error", signal: expect.any(AbortSignal) });
    expect(mocks.normalize).toHaveBeenCalledWith(Buffer.from(bytes));
    expect(db.output.upload).toHaveBeenCalledWith(videoPath, normalized.video, { contentType: "video/mp4", upsert: false });
    expect(db.output.createSignedUrl).toHaveBeenCalledWith(videoPath, 3600);
    expect(db.source.remove).toHaveBeenCalledWith([sourcePath]);
    expect(db.output.remove).not.toHaveBeenCalled();
  });
});
