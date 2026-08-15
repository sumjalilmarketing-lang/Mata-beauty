import { timingSafeEqual } from "node:crypto";
import { serviceSupabase } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await serviceSupabase().rpc("publish_due_social_posts");
    if (error) throw error;
    return Response.json({ ok: true, published: Number(data ?? 0) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Scheduled publishing unavailable" }, { status: 503 });
  }
}
