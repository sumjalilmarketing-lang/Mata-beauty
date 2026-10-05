import { timingSafeEqual } from "node:crypto";
import { deliverTransactionalEmails } from "@/lib/email/transactional";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await deliverTransactionalEmails(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("transactional_email_worker_failed");
    return Response.json({ error: "delivery_pending" }, { status: 503 });
  }
}
