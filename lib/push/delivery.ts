import webpush from "web-push";
import { serviceSupabase } from "../payments/server";
import { allowedPushEndpoint, pushPayload } from "./policy";

type Delivery = { delivery_id: string; lease: string; subscription_id: string; endpoint: string; keys: { auth: string; p256dh: string }; sound: boolean; notification_id: string; kind: string; data: Record<string, unknown> };
export async function deliverWebPush() {
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY, privateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { enabled: false, sent: 0, failed: 0 };
  const client = serviceSupabase();
  const result = await client.rpc("claim_web_push");
  if (result.error) throw new Error("push_claim_failed");
  let sent = 0, failed = 0;
  for (const item of (result.data ?? []) as Delivery[]) {
    let outcome = "failed";
    try {
      if (!allowedPushEndpoint(item.endpoint)) throw new Error("push_endpoint_rejected");
      await webpush.sendNotification({ endpoint: item.endpoint, keys: item.keys }, JSON.stringify(pushPayload({ id: item.notification_id, kind: item.kind, data: item.data }, item.sound)), {
        vapidDetails: { subject: "https://mata-beauty.com", publicKey, privateKey },
        TTL: 3600, urgency: "high", timeout: 5000,
      });
      outcome = "sent";
      sent++;
    } catch (error) {
      const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) {
        // Revoked/expired endpoint: cascade removes pending deliveries too.
        const removed = await client.from("web_push_subscriptions").delete().eq("id", item.subscription_id);
        if (removed.error) throw new Error("push_expiry_failed");
      } else outcome = status === 429 || status >= 500 || status === 0 ? "retry" : "failed";
      failed++;
    }
    const finished = await client.rpc("finish_web_push", { delivery_id: item.delivery_id, lease: item.lease, outcome });
    if (finished.error) throw new Error("push_receipt_failed");
  }
  return { enabled: true, sent, failed };
}
