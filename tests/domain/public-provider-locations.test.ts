import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/public/provider-locations/route";

const mocks = vi.hoisted(() => ({ service: vi.fn() }));
vi.mock("../../lib/payments/server", () => ({ serviceSupabase: mocks.service }));

const approvedId = "a8c338c6-434d-42bb-916e-99a29f7e85ca";
const otherId = "bbd00a1c-84c1-4c6d-b4fc-10e5662d17bd";

function query(data: unknown, error: object | null = null) {
  const value = Promise.resolve({ data, error });
  type QueryResult = { data: unknown; error: object | null };
  type Query = {
    select: (columns: string) => Query;
    eq: (column: string, value: string) => Query;
    in: (column: string, values: string[]) => Query;
    limit: (count: number) => Query;
    then: Promise<QueryResult>["then"];
  };
  const calls = { eq: vi.fn(), in: vi.fn() };
  const chain: Query = {
    select: () => chain,
    eq: (...args) => { calls.eq(...args); return chain; },
    in: (...args) => { calls.in(...args); return chain; },
    limit: () => chain,
    then: (onFulfilled, onRejected) => value.then(onFulfilled, onRejected),
  };
  return { chain, calls };
}

function service(approved: unknown, locations: unknown, approvedError: object | null = null, locationError: object | null = null) {
  const approvedQuery = query(approved, approvedError);
  const locationQuery = query(locations, locationError);
  const from = vi.fn((table: string) => table === "provider_profiles" ? approvedQuery.chain : locationQuery.chain);
  mocks.service.mockReturnValue({ from });
  return { from, approvedQuery: approvedQuery.calls, locationQuery: locationQuery.calls };
}

const request = (ids: string) => new Request(`https://mata-beauty.com/api/public/provider-locations?ids=${encodeURIComponent(ids)}`);

beforeEach(() => vi.resetAllMocks());

describe("public professional location metadata", () => {
  it("rejects invalid or oversized identity lists before using the service client", async () => {
    expect((await GET(request("not-a-uuid"))).status).toBe(400);
    expect((await GET(request(Array.from({ length: 101 }, (_, index) => `a8c338c6-434d-42bb-916e-${String(index).padStart(12, "0")}`).join(",")))).status).toBe(400);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("uses the establishment's country and never the owner's private profile", async () => {
    const db = service([
      { profile_id: approvedId, country_code: "FR" },
      { profile_id: otherId, country_code: "Senegal" },
    ], [{ id: approvedId, country_code: "SN" }]);
    const response = await GET(request(`${approvedId},${otherId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ providerId: approvedId, countryCode: "FR" }]);
    expect(db.approvedQuery.eq).toHaveBeenCalledWith("status", "approved");
    expect(db.approvedQuery.in).toHaveBeenCalledWith("profile_id", [approvedId, otherId]);
    expect(db.from.mock.calls.every(([table]) => table === "provider_profiles")).toBe(true);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
  });

  it("omits unknown countries on the legacy schema without reading personal profiles", async () => {
    const db = service(null, [{ id: approvedId, country_code: "SN" }], { code: "42703", message: "column does not exist" });
    const response = await GET(request(approvedId));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith("provider_profiles");
  });

  it("does not publish unrequested or invalid country records", async () => {
    service([{ profile_id: otherId, country_code: "US" }, { profile_id: approvedId, country_code: null }], []);
    expect(await (await GET(request(approvedId))).json()).toEqual([]);
  });

  it("fails closed without leaking database errors", async () => {
    service(null, [], { message: "private database detail" });
    const response = await GET(request(approvedId));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "provider_locations_unavailable" });
  });
});
