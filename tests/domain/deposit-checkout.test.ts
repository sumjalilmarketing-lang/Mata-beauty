import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rate: 0, unavailable: false, initialize: vi.fn() }));
vi.mock("@/lib/payments/gateway", () => ({ paymentCapabilities: () => ({ onlineCheckoutEnabled: true, methods: ["wave"] }), getPaymentGateway: vi.fn() }));
vi.mock("@/lib/payments/server", () => ({
 hasTrustedOrigin: () => true, consumeRateLimit: async () => true, requestContext: () => ({ ipHash: "test", requestId: "test" }), requestFingerprint: () => "test",
 applicationOrigin: () => "https://mata-beauty.com", serviceSupabase: vi.fn(),
 jsonError: (error: string, status: number, code: string) => Response.json({error,code},{status}),
 authenticatedSupabase: async () => ({ user: {id:"client"}, client: {
  from: (table: string) => { const query = { select: () => query, eq: () => query, maybeSingle: async () => table === "bookings" ? {data:{id:"booking",client_id:"client",provider_service_id:"service",total_amount:10000,currency:"XOF",status:"pending"}} : {data:state.unavailable ? null : {deposit_percentage:state.rate},error:state.unavailable ? {message:"unavailable"}:null} }; return query; },
  rpc: state.initialize,
 } }),
}));
import { POST } from "@/app/api/payments/create/route";
const request = () => new Request("https://mata-beauty.com/api/payments/create", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({bookingId:"55555555-5555-4555-8555-555555555555",method:"wave",attempt:"test-attempt"})});
beforeEach(() => {state.rate=0;state.unavailable=false;state.initialize.mockReset();state.initialize.mockResolvedValue({data:null,error:{message:"test stop"}});});
describe("deposit checkout safety", () => {
 it.each([30,60])("does not initialize a full checkout for a %s%% deposit service", async rate => {state.rate=rate;const response=await POST(request());expect(response.status).toBe(409);expect((await response.json()).code).toBe("DEPOSIT_COLLECTION_UNAVAILABLE");expect(state.initialize).not.toHaveBeenCalled();});
 it("fails closed if the service configuration is unavailable", async () => {state.unavailable=true;expect((await POST(request())).status).toBe(503);expect(state.initialize).not.toHaveBeenCalled();});
 it("keeps existing zero-deposit sandbox initialization available", async () => {await POST(request());expect(state.initialize).toHaveBeenCalledWith("initialize_payment_v2",expect.objectContaining({target_booking_id:"booking",target_method:"wave"}));});
});
