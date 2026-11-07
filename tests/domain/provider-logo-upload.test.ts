import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MAX_LOGO_BYTES, normalizeProviderLogo, readLogoUpload } from "../../lib/media/provider-logo";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), query: vi.fn(), eq: vi.fn(), update: vi.fn(), upload: vi.fn(), remove: vi.fn(), service: vi.fn(), quota: vi.fn(), rpc: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({ authenticatedSupabase: mocks.auth, hasTrustedOrigin: mocks.origin, serviceSupabase: mocks.service, consumeRateLimit: mocks.quota, jsonError: (message: string, status: number) => Response.json({ error: message }, { status }) }));
import { POST } from "../../app/api/professionals/logo/route";
import { POST as uploadImage } from "../../app/api/media/images/route";

const userId = "11111111-1111-4111-8111-111111111111";
const savedUrl = "https://storage.example.test/avatars/new.webp";
let png: Buffer;
function request(file: Blob, extra?: string) {
  const form = new FormData(); form.set("file", file, "logo.png"); if (extra) form.set("userId", extra);
  return new Request("https://mata-beauty.com/api/professionals/logo", { method: "POST", body: form });
}
beforeEach(async () => {
  vi.resetAllMocks(); mocks.origin.mockReturnValue(true); mocks.quota.mockResolvedValue(true); mocks.rpc.mockResolvedValue({ data: { account_status: "active", is_suspended: false }, error: null });
  png = await sharp({ create: { width: 40, height: 30, channels: 4, background: "red" } }).png().toBuffer();
  const builder = { select: vi.fn(() => builder), eq: mocks.eq, maybeSingle: mocks.query, update: mocks.update, is: vi.fn(() => builder), insert: vi.fn(() => builder) };
  mocks.eq.mockReturnValue(builder); mocks.update.mockReturnValue(builder);
  mocks.query.mockResolvedValueOnce({ data: { profile_id: userId }, error: null }).mockResolvedValue({ data: { profile_id: userId, logo_url: savedUrl }, error: null });
  mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
  mocks.auth.mockResolvedValue({ user: { id: userId }, client: { rpc: mocks.rpc, from: vi.fn(() => builder), storage: { from: vi.fn(() => ({ upload: mocks.upload, remove: mocks.remove, getPublicUrl: () => ({ data: { publicUrl: savedUrl } }) })) } } });
  mocks.service.mockReturnValue({ storage: { from: vi.fn(() => ({ upload: mocks.upload, remove: mocks.remove, getPublicUrl: () => ({ data: { publicUrl: savedUrl } }) })) } });
});

describe("server-validated provider logos", () => {
  it("requires a trusted origin and authenticated account before parsing", async () => {
    mocks.origin.mockReturnValue(false); expect((await POST(request(new Blob()))).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled(); mocks.origin.mockReturnValue(true); mocks.auth.mockResolvedValue(null);
    expect((await POST(request(new Blob()))).status).toBe(401); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects caller-selected ownership fields", async () => {
    expect((await POST(request(new Blob([new Uint8Array(png)], { type: "image/png" }), "victim"))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects accounts without an owned professional profile", async () => {
    mocks.query.mockReset().mockResolvedValue({ data: null, error: null });
    expect((await POST(request(new Blob([new Uint8Array(png)], { type: "image/png" })))).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects mislabeled, empty, oversized and decompression-heavy images", async () => {
    for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), Buffer.from("not an image"), Buffer.alloc(0), Buffer.alloc(MAX_LOGO_BYTES + 1)]) {
      await expect(normalizeProviderLogo(bytes, "image/png")).rejects.toThrow();
    }
    const oversized = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizeProviderLogo(oversized, "image/png")).rejects.toThrow();
  });
  it("decodes and normalizes JPEG, PNG and WebP", async () => {
    for (const [bytes, type] of [[png, "image/png"], [await sharp(png).jpeg().toBuffer(), "image/jpeg"], [await sharp(png).webp().toBuffer(), "image/webp"]] as const) {
      const result = await normalizeProviderLogo(bytes, type); const metadata = await sharp(result).metadata();
      expect(metadata.format).toBe("webp"); expect(metadata.exif).toBeUndefined(); expect(metadata.width).toBe(40);
    }
  });
  it("enforces the body limit even without Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_LOGO_BYTES + 65537)); controller.close(); } });
    const input = new Request("https://example.test", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x" }, body, duplex: "half" } as RequestInit);
    await expect(readLogoUpload(input)).rejects.toThrow("too_large");
  });
  it("uploads only under the authenticated user and confirms the saved pointer", async () => {
    const result = await POST(request(new Blob([new Uint8Array(png)], { type: "image/png" })));
    expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${userId}/provider-logo-.*\\.webp$`)), expect.any(Buffer), { contentType: "image/webp", upsert: false });
    expect(mocks.eq.mock.calls.every(call => call[0] === "profile_id" && call[1] === userId)).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ logo_url: savedUrl }); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves files after a failed publication without touching the old logo", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ data: { profile_id: userId } }).mockResolvedValueOnce({ error: { message: "db failed" } }).mockResolvedValueOnce({ data: { logo_url: "old.webp" } });
    expect((await POST(request(new Blob([new Uint8Array(png)], { type: "image/png" })))).status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves an uploaded file when the save outcome cannot be verified", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ data: { profile_id: userId } }).mockResolvedValue({ error: { message: "network" } });
    expect((await POST(request(new Blob([new Uint8Array(png)], { type: "image/png" })))).status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

function imageRequest(kind: string, options: Record<string, string> = {}) {
  const form = new FormData(); form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "photo.png"); form.set("kind", kind);
  for (const [key, value] of Object.entries(options)) form.set(key, value);
  return new Request("https://mata-beauty.com/api/media/images", { method: "POST", body: form });
}
describe("unified validated image publications", () => {
  for (const kind of ["salon-logo", "salon-cover"] as const) it(`confirms ${kind} through the controlled branding operation`, async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "owns_business" ? true : name === "set_salon_brand_image" ? userId : { account_status: "active", is_suspended: false } }));
    mocks.query.mockReset().mockResolvedValue({ data: { id: userId } });
    expect((await uploadImage(imageRequest(kind, { businessId: userId }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("set_salon_brand_image", { target_business_id: userId, target_kind: kind.slice(6), target_url: savedUrl });
  });
  it("confirms a collaborator photo within the verified owned salon", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "owns_business" ? true : { account_status: "active", is_suspended: false } }));
    mocks.query.mockReset().mockResolvedValueOnce({ data: { id: userId } }).mockResolvedValueOnce({ data: { avatar_url: savedUrl } });
    expect((await uploadImage(imageRequest("collaborator-avatar", { businessId: userId, collaboratorId: userId }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ avatar_url: savedUrl });
    expect(mocks.eq).toHaveBeenCalledWith("business_id", userId);
    expect(mocks.eq).toHaveBeenCalledWith("id", userId);
  });
  it("rejects a suspended account before quotas or image processing", async () => {
    mocks.rpc.mockResolvedValue({ data: { account_status: "active", is_suspended: true } });
    expect((await uploadImage(imageRequest("avatar"))).status).toBe(403);
    expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("stops exhausted or unavailable quotas before privileged storage", async () => {
    mocks.quota.mockResolvedValue(false);
    expect((await uploadImage(imageRequest("avatar"))).status).toBe(429);
    mocks.quota.mockRejectedValue(new Error("offline"));
    expect((await uploadImage(imageRequest("avatar"))).status).toBe(503);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("publishes avatars under the verified account, including daily quotas", async () => {
    mocks.query.mockReset().mockResolvedValue({ data: { avatar_url: savedUrl } });
    expect((await uploadImage(imageRequest("avatar"))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ avatar_url: savedUrl });
    expect(mocks.eq).toHaveBeenCalledWith("id", userId);
    expect(mocks.upload.mock.calls[0][0]).toMatch(new RegExp(`^${userId}/avatar-.*\\.webp$`));
    expect(mocks.quota).toHaveBeenCalledWith({ scope: "image_upload_user_day", key: userId, limit: 100, windowSeconds: 86400 });
  });
  it("rejects another salon before normalization or privileged upload", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "owns_business" ? false : { account_status: "active", is_suspended: false } }));
    expect((await uploadImage(imageRequest("salon-logo", { businessId: userId }))).status).toBe(403);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("rejects a collaborator outside the owned salon", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "owns_business" ? true : { account_status: "active", is_suspended: false } }));
    mocks.query.mockReset().mockResolvedValue({ data: null });
    expect((await uploadImage(imageRequest("collaborator-avatar", { businessId: userId, collaboratorId: userId }))).status).toBe(403);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("writes salon galleries using caller-scoped metadata after normalized upload", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "owns_business" ? true : { account_status: "active", is_suspended: false } }));
    mocks.query.mockReset().mockResolvedValue({ data: { id: userId } });
    expect((await uploadImage(imageRequest("salon-gallery", { businessId: userId, sortOrder: "2" }))).status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/salon-gallery-.*\.webp$/), expect.any(Buffer), { contentType: "image/webp", upsert: false });
    expect(mocks.rpc).not.toHaveBeenCalledWith("set_salon_brand_image", expect.anything());
  });
});
