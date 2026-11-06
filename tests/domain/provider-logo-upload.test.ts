import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MAX_LOGO_BYTES, normalizeProviderLogo, readLogoUpload } from "../../lib/media/provider-logo";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), query: vi.fn(), eq: vi.fn(), update: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({ authenticatedSupabase: mocks.auth, hasTrustedOrigin: mocks.origin, jsonError: (message: string, status: number) => Response.json({ error: message }, { status }) }));
import { POST } from "../../app/api/professionals/logo/route";

const userId = "11111111-1111-4111-8111-111111111111";
const savedUrl = "https://storage.example.test/avatars/new.webp";
let png: Buffer;
function request(file: Blob, extra?: string) {
  const form = new FormData(); form.set("file", file, "logo.png"); if (extra) form.set("userId", extra);
  return new Request("https://mata-beauty.com/api/professionals/logo", { method: "POST", body: form });
}
beforeEach(async () => {
  vi.resetAllMocks(); mocks.origin.mockReturnValue(true);
  png = await sharp({ create: { width: 40, height: 30, channels: 4, background: "red" } }).png().toBuffer();
  const builder = { select: vi.fn(() => builder), eq: mocks.eq, maybeSingle: mocks.query, update: mocks.update };
  mocks.eq.mockReturnValue(builder); mocks.update.mockReturnValue(builder);
  mocks.query.mockResolvedValueOnce({ data: { profile_id: userId }, error: null }).mockResolvedValue({ data: { profile_id: userId, logo_url: savedUrl }, error: null });
  mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
  mocks.auth.mockResolvedValue({ user: { id: userId }, client: { from: vi.fn(() => builder), storage: { from: vi.fn(() => ({ upload: mocks.upload, remove: mocks.remove, getPublicUrl: () => ({ data: { publicUrl: savedUrl } }) })) } } });
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
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${userId}/professional-logo-.*\\.webp$`)), expect.any(Buffer), { contentType: "image/webp", upsert: false });
    expect(mocks.eq.mock.calls.every(call => call[0] === "profile_id" && call[1] === userId)).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ logo_url: savedUrl }); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("cleans a new file after a verified save failure without touching the old logo", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ data: { profile_id: userId } }).mockResolvedValueOnce({ error: { message: "db failed" } }).mockResolvedValueOnce({ data: { logo_url: "old.webp" } });
    expect((await POST(request(new Blob([new Uint8Array(png)], { type: "image/png" })))).status).toBe(503);
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
  });
  it("preserves an uploaded file when the save outcome cannot be verified", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ data: { profile_id: userId } }).mockResolvedValue({ error: { message: "network" } });
    expect((await POST(request(new Blob([new Uint8Array(png)], { type: "image/png" })))).status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
