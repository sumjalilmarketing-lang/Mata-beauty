import { validDispatchRequest } from "@/lib/email/dispatch-auth";
import { deliverTransactionalEmails } from "@/lib/email/transactional";
import { cleanupAbandonedMessageUploads, cleanupExpiredProfessionalStories } from "@/lib/messaging/cleanup";

export const maxDuration = 60;
export async function GET(request: Request) {
  if (!validDispatchRequest(request.headers, process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  try {
    const delivery = await deliverTransactionalEmails();
    // Keep email dispatch independent from temporary storage failures.
    await cleanupAbandonedMessageUploads().catch(() => console.error("abandoned_message_upload_cleanup_pending"));
    await cleanupExpiredProfessionalStories().catch(() => console.error("professional_story_cleanup_pending"));
    return Response.json(delivery, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("transactional_email_worker_failed");
    return Response.json({ error: "delivery_pending" }, { status: 503 });
  }
}
