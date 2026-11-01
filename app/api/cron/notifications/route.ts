import { validDispatchRequest } from "@/lib/email/dispatch-auth";
import { deliverTransactionalEmails } from "@/lib/email/transactional";

export const maxDuration = 60;
export async function GET(request: Request) {
  if (!validDispatchRequest(request.headers, process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await deliverTransactionalEmails(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("transactional_email_worker_failed");
    return Response.json({ error: "delivery_pending" }, { status: 503 });
  }
}
