import { validDispatchRequest } from "@/lib/email/dispatch-auth";
import { deliverTransactionalEmails } from "@/lib/email/transactional";
import { deliverWebPush } from "@/lib/push/delivery";

export const maxDuration = 60;
export async function GET(request: Request) {
  if (!validDispatchRequest(request.headers, process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  try {
    // An email outage must not prevent push delivery (and vice versa).
    const [email, push] = await Promise.allSettled([deliverTransactionalEmails(), deliverWebPush()]);
    if (email.status === "rejected") console.error("transactional_email_worker_failed");
    if (push.status === "rejected") console.error("web_push_worker_failed");
    return Response.json({ email: email.status === "fulfilled" ? email.value : { pending: true }, push: push.status === "fulfilled" ? push.value : { pending: true } }, { status: email.status === "rejected" || push.status === "rejected" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("transactional_email_worker_failed");
    return Response.json({ error: "delivery_pending" }, { status: 503 });
  }
}
