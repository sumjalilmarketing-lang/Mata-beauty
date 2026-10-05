import { serviceSupabase } from "../payments/server";
import { notificationDestination } from "../domain/notifications";

type Delivery = { delivery_id: string; recipient: string; title: string; body: string; kind: string; data: Record<string, unknown> };
export async function deliverTransactionalEmails() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("email_transport_unconfigured");
  const client = serviceSupabase();
  const claim = await client.rpc("claim_transactional_emails", { batch_size: 5 });
  if (claim.error) throw new Error("email_claim_failed");
  let sent = 0, failed = 0;
  for (const delivery of (claim.data ?? []) as Delivery[]) {
    const href = notificationDestination(delivery);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `notification-v1-${delivery.delivery_id}` },
        body: JSON.stringify({ from: "MATA Beauty <bonjour@mata-beauty.com>", to: [delivery.recipient], subject: delivery.title, text: `${delivery.body}${href ? `\n\nConsulter : https://mata-beauty.com${href}` : ""}\n\nMATA Beauty` }),
        signal: AbortSignal.timeout(8_000),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string") throw new Error("email_send_failed");
      const saved = await client.from("notification_deliveries").update({ status: "sent", provider_reference: result.id, error_message: null }).eq("id", delivery.delivery_id);
      if (saved.error) throw new Error("email_receipt_failed");
      sent++;
    } catch {
      failed++;
      // Preserve the same recipient, content and idempotency key on retry.
      await client.from("notification_deliveries").update({ status: "failed", error_message: "Envoi à reprendre ; aucune réception confirmée." }).eq("id", delivery.delivery_id);
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return { sent, failed };
}
