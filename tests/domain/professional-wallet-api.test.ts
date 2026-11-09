import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({
  authenticatedSupabase: mocks.auth,
  jsonError: (message: string, status: number, code: string) => Response.json({ ok: false, error: { code, message } }, { status }),
}));
import { GET } from "../../app/api/professionals/wallet/route";

function result(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
const request = () => new Request("https://mata-beauty.com/api/professionals/wallet");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "professional" }, client: { from: mocks.from } });
});

describe("professional wallet failure handling", () => {
  it("requires authentication before reading financial data", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("distinguishes profile outage from forbidden access", async () => {
    mocks.from.mockReturnValue(result(null, { message: "private database detail" }));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database detail");
  });

  it("does not report an empty balance when the wallet lookup fails", async () => {
    mocks.from.mockReturnValueOnce(result({ role: "provider" })).mockReturnValueOnce(result(null, { message: "private database detail" }));
    const response = await GET(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body).not.toHaveProperty("balance");
    expect(JSON.stringify(body)).not.toContain("private database detail");
  });

  it("uses the normal balance contract for a confirmed absent wallet", async () => {
    mocks.from.mockReturnValueOnce(result({ role: "provider" })).mockReturnValueOnce(result(null));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, balance: { currency: "XOF", pending_balance: 0, available_balance: 0, total_earned: 0, total_paid_out: 0 }, entries: [] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
