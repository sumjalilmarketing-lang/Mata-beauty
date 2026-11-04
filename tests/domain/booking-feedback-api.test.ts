import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({ authenticatedSupabase: mocks.auth, hasTrustedOrigin: () => true, jsonError: (message: string, status: number, code: string) => Response.json({ error: { code, message } }, { status }) }));
import { POST, GET } from "../../app/api/bookings/reviews/route";
const bookingId = "34e7263e-b719-45c0-9f6a-6e639b3bef9b";
function request(body: unknown) { return new Request("https://mata-beauty.com/api/bookings/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "actor" }, client: { rpc: mocks.rpc } }); mocks.rpc.mockResolvedValue({ data: "review-id", error: null }); });
describe("verified booking feedback", () => {
    it("requires authentication", async () => { mocks.auth.mockResolvedValue(null); expect((await POST(request({}))).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled(); });
    it("rejects caller-selected reviewer and embargo dates", async () => { expect((await POST(request({ bookingId, type: "client_to_provider", rating: 5, reviewer_id: "victim" }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled(); });
    it("rejects invalid stars", async () => { for (const rating of [0, 6, 3.5])
        expect((await POST(request({ bookingId, type: "provider_to_client", rating }))).status).toBe(400); });
    it("submits with session-scoped RPC and private visibility", async () => { const r = await POST(request({ bookingId, type: "provider_to_client", rating: 4, comment: "Ponctuel", criteria: ["respect"], visibility: "internal" })); expect(r.status).toBe(201); expect(mocks.rpc).toHaveBeenCalledWith("submit_booking_review", expect.objectContaining({ target_booking_id: bookingId, target_visibility: "internal", target_type: "provider_to_client" })); });
    it("does not disclose database errors", async () => { mocks.rpc.mockResolvedValue({ error: { message: "sensitive database data" } }); const r = await POST(request({ bookingId, type: "client_to_provider", rating: 5 })); expect(r.status).toBe(409); expect(await r.text()).not.toContain("sensitive"); });
    it("never caches review responses", async () => { mocks.rpc.mockResolvedValue({ data: [], error: null }); const r = await GET(new Request(`https://mata-beauty.com/api/bookings/reviews?bookingId=${bookingId}`)); expect(r.headers.get("Cache-Control")).toBe("private, no-store"); });
});
