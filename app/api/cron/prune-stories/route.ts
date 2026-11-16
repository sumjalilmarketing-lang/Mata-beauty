import { timingSafeEqual } from "node:crypto";
import { serviceSupabase } from "@/lib/payments/server";

export const dynamic = "force-dynamic";
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const incoming = header.slice(7);
  const a = Buffer.from(secret);
  const b = Buffer.from(incoming);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization")))
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const db = serviceSupabase();
    const { data, error } = await db.from("professional_stories")
      .select("id,media_path").lt("expires_at", new Date().toISOString()).order("expires_at").limit(100);
    if (error) throw error;
    let deleted = 0;
    for (const story of data ?? []) {
      const removed = await db.storage.from("professional-stories").remove([story.media_path]);
      if (removed.error) continue;
      const row = await db.from("professional_stories").delete().eq("id", story.id);
      if (!row.error) deleted++;
    }
    return Response.json({ deleted, scanned: data?.length ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "cleanup_failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
