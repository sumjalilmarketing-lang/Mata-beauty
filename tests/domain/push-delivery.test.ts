import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), rpc: vi.fn(), remove: vi.fn(), owner: vi.fn(), count: vi.fn() }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
vi.mock("../../lib/payments/server", () => ({ serviceSupabase: () => ({ rpc: mocks.rpc, from: (table: string) => ({ delete: () => ({ eq: mocks.remove }), select: () => ({ eq: (key: string, value: string) => table === "web_push_subscriptions" ? { single: () => mocks.owner(key, value) } : { is: () => mocks.count(key, value) } }) }) }) }));
import { deliverWebPush } from "../../lib/push/delivery";
const delivery = { delivery_id: "q1", lease: "lease1", subscription_id: "s1", endpoint: "https://web.push.apple.com/device", keys: { auth: "test", p256dh: "test" }, sound: true, notification_id: "n1", kind: "booking_created", data: {} };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PUSH_VAPID_PUBLIC_KEY", "public-test-key"); vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", "private-test-key");
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_web_push" ? [delivery] : null, error: null }));
  mocks.remove.mockResolvedValue({ error: null });
  mocks.owner.mockResolvedValue({ data: { profile_id: "owner-of-s1" }, error: null });
  mocks.count.mockResolvedValue({ count: 4, error: null });
});
it("records success only after the push service accepts delivery", async () => {
  mocks.send.mockResolvedValue({ statusCode: 201 });
  expect(await deliverWebPush()).toMatchObject({ sent: 1, failed: 0 });
  expect(mocks.rpc).toHaveBeenLastCalledWith("finish_web_push", { delivery_id: "q1", lease: "lease1", outcome: "sent" });
  expect(mocks.owner).toHaveBeenCalledWith("id", "s1");
  expect(mocks.count).toHaveBeenCalledWith("profile_id", "owner-of-s1");
  expect(JSON.parse(mocks.send.mock.calls[0][1])).toMatchObject({ unreadCount: 4, silent: false });
});
it("retries transient failures without logging endpoint or private response", async () => {
  mocks.send.mockRejectedValue({ statusCode: 503, body: "private service details" });
  expect(await deliverWebPush()).toMatchObject({ sent: 0, failed: 1 });
  expect(mocks.rpc).toHaveBeenLastCalledWith("finish_web_push", expect.objectContaining({ outcome: "retry" }));
});
it("removes revoked endpoints and their pending queue", async () => {
  mocks.send.mockRejectedValue({ statusCode: 410 });
  await deliverWebPush();
  expect(mocks.remove).toHaveBeenCalledWith("id", "s1");
});
it("does not claim or send when the server keys are absent", async () => {
  vi.stubEnv("PUSH_VAPID_PRIVATE_KEY", "");
  expect(await deliverWebPush()).toMatchObject({ enabled: false });
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
