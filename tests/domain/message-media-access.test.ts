import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../app/api/messages/media/route";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), rpc: vi.fn(), storage: vi.fn(), row: vi.fn(), userRpc: vi.fn(), signer: vi.fn(), download: vi.fn(), upload: vi.fn(), remove: vi.fn(), validate: vi.fn(), rejectUpdate: vi.fn(), rejectEq: vi.fn(), rejectAfter: vi.fn(), rejectedRows: vi.fn() }));
vi.mock("../../lib/messaging/media", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../lib/messaging/media")>(), validateMessageMedia: mocks.validate,
}));
vi.mock("../../lib/payments/server", () => ({
  authenticatedSupabase: mocks.authenticate,
  serviceSupabase: () => ({ rpc: mocks.rpc, storage: { from: mocks.storage }, from: () => ({ update: mocks.rejectUpdate }) }),
}));
const id = "a8c338c6-434d-42bb-916e-99a29f7e85ca";
const nonce = "11111111-2222-4333-8444-555555555555";
const lease = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const get = () => new Request(`https://mata-beauty.com/api/messages/media?attachment=${id}`);
const post = (body: unknown) => new Request("https://mata-beauty.com/api/messages/media", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const prepare = { phase: "prepare", conversationId: id, filename: "photo.png", contentType: "image/png", size: 100, clientNonce: nonce };
const complete = { phase: "complete", attachmentId: id, clientNonce: nonce };
const pending = { id, conversation_id: id, uploader_id: "verified-actor", storage_path: "private/source.png", mime_type: "image/png", size_bytes: 3, status: "pending", created_at: new Date().toISOString(), message_id: null, upload_nonce: nonce, deleted_at: null };

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.row };
  mocks.authenticate.mockResolvedValue({ user: { id: "verified-actor" }, client: { from: () => query, rpc: mocks.userRpc } });
  mocks.storage.mockReturnValue({ createSignedUrl: mocks.signer, download: mocks.download, upload: mocks.upload, remove: mocks.remove });
  const rejectionQuery = { eq: mocks.rejectEq, gt: mocks.rejectAfter, select: mocks.rejectedRows };
  mocks.rejectUpdate.mockReturnValue(rejectionQuery); mocks.rejectEq.mockReturnValue(rejectionQuery); mocks.rejectAfter.mockReturnValue(rejectionQuery);
});

describe("private media server boundary", () => {
  it("requires authentication for signing and upload preparation", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    expect((await POST(post(prepare))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("takes the sender from the verified session, never the submitted body", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await POST(post({ ...prepare, actorId: "forged-provider" }))).status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_message_attachment", expect.objectContaining({ target_actor_id: "verified-actor" }));
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("rejects declared oversized or executable files before storage", async () => {
    for (const change of [{ size: 50 * 1024 * 1024 }, { contentType: "text/html" }, { size: -1 }]) {
      expect((await POST(post({ ...prepare, ...change }))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("never signs hidden, pending, deleted, nonmember or suspended content", async () => {
    for (const row of [null, { status: "pending" }, { status: "ready", deleted_at: "2026-10-11" }]) {
      mocks.row.mockResolvedValue({ data: row, error: null });
      expect((await GET(get())).status).toBe(404);
    }
    mocks.row.mockResolvedValue({ data: { status: "ready", deleted_at: null, conversation_id: id, storage_path: "private/path.png" }, error: null });
    mocks.userRpc.mockResolvedValue({ data: false, error: null });
    expect((await GET(get())).status).toBe(404);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("fails closed on permission errors instead of signing with the server key", async () => {
    mocks.row.mockResolvedValue({ data: { status: "ready", deleted_at: null, conversation_id: id, storage_path: "private/path.png" }, error: null });
    mocks.userRpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await GET(get())).status).toBe(404);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("signs only a validated participant object for two minutes with no-store", async () => {
    mocks.row.mockResolvedValue({ data: { status: "ready", deleted_at: null, conversation_id: id, storage_path: "private/validated.png" }, error: null });
    mocks.userRpc.mockResolvedValue({ data: true, error: null });
    mocks.signer.mockResolvedValue({ data: { signedUrl: "https://storage.example/temporary" }, error: null });
    const response = await GET(get());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.signer).toHaveBeenCalledWith("private/validated.png", 120);
    expect(await response.json()).not.toHaveProperty("storage_path");
  });
  it("blocks simultaneous or exhausted validation attempts before reading any bytes", async () => {
    mocks.row.mockResolvedValue({ data: pending, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: { status: "busy", retry_after_seconds: 42 }, error: null })
      .mockResolvedValueOnce({ data: { status: "exhausted" }, error: null });
    const busy = await POST(post(complete));
    expect(busy.status).toBe(429); expect(busy.headers.get("retry-after")).toBe("42");
    expect((await POST(post(complete))).status).toBe(429);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_message_attachment_validation", { target_actor_id: "verified-actor", target_attachment_id: id, target_client_nonce: nonce });
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.validate).not.toHaveBeenCalled();
  });
  it("fails closed when the lease service fails or returns malformed data", async () => {
    mocks.row.mockResolvedValue({ data: pending, error: null });
    for (const result of [{ data: null, error: { code: "42501" } }, { data: null, error: { code: "XX000" } }, { data: { status: "claimed", lease_id: "invalid" }, error: null }]) {
      mocks.rpc.mockResolvedValue(result);
      expect((await POST(post(complete))).status).toBe(result.error?.code === "42501" ? 404 : 503);
    }
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.validate).not.toHaveBeenCalled();
  });
  it("returns a concurrent ready retry without repeating download, parsing or completion", async () => {
    mocks.row.mockResolvedValue({ data: pending, error: null });
    const message = { id, body: "Photo" };
    mocks.rpc.mockResolvedValue({ data: { status: "ready", message }, error: null });
    const response = await POST(post(complete));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ message });
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("passes the server lease through completion and never trusts a browser supplied lease", async () => {
    mocks.row.mockResolvedValue({ data: pending, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: { status: "claimed", lease_id: lease }, error: null })
      .mockResolvedValueOnce({ data: { message: { id } }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null });
    mocks.validate.mockResolvedValue({ bytes: Buffer.from([4, 5]), contentType: "image/png", width: 1, height: 1, duration: null });
    mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
    const response = await POST(post({ ...complete, validationLease: nonce }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_message_attachment", expect.objectContaining({ target_validation_lease: lease, target_actor_id: "verified-actor", target_size_bytes: 2 }));
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.download.mock.invocationCallOrder[0]);
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith([pending.storage_path]);
  });
  it("does not finalize or release the lease when source storage has not received the upload", async () => {
    mocks.row.mockResolvedValue({ data: pending, error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "claimed", lease_id: lease }, error: null });
    mocks.download.mockResolvedValue({ error: { message: "missing" }, data: null });
    expect((await POST(post(complete))).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.validate).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects malformed bytes only while this request still owns the current lease", async () => {
    mocks.row.mockResolvedValue({ data: pending, error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "claimed", lease_id: lease }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null });
    mocks.validate.mockRejectedValue(new Error("malformed"));
    mocks.rejectedRows.mockResolvedValue({ data: [{ id }], error: null });
    mocks.remove.mockResolvedValue({ error: null });
    expect((await POST(post(complete))).status).toBe(400);
    expect(mocks.rejectEq).toHaveBeenCalledWith("validation_lease_id", lease);
    expect(mocks.rejectAfter).toHaveBeenCalledWith("validation_lease_until", expect.any(String));
    expect(mocks.remove).toHaveBeenCalledWith([pending.storage_path]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("never deletes the source if a newer validation already replaced an expired lease", async () => {
    mocks.row.mockResolvedValue({ data: pending, error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "claimed", lease_id: lease }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null });
    mocks.validate.mockRejectedValue(new Error("malformed"));
    mocks.rejectedRows.mockResolvedValue({ data: [], error: null });
    expect((await POST(post(complete))).status).toBe(400);
    expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
});
