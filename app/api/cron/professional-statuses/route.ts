import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const BUCKET = "professional-status-media";

function safeAuthorization(value: string | null, secret: string | undefined) {
  if (!secret || !value) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  if (!safeAuthorization(request.headers.get("Authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return Response.json({ error: "not_configured" }, { status: 503 });
  const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const expired = await db.from("professional_statuses")
    .select("id,media_path").lte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true }).limit(80);
  if (expired.error) {
    console.error("professional_status_cleanup_read_failed");
    return Response.json({ error: "read_failed" }, { status: 503 });
  }
  let removed = 0;
  let failures = 0;
  const batch = expired.data ?? [];
  for (let offset = 0; offset < batch.length; offset += 20) {
    const slice = batch.slice(offset, offset + 20);
    const storage = await db.storage.from(BUCKET).remove(slice.map(item => item.media_path));
    if (storage.error) {
      failures += slice.length;
      console.error("professional_status_storage_cleanup_failed");
      continue;
    }
    const deleted = await db.from("professional_statuses").delete().in("id", slice.map(item => item.id));
    if (deleted.error) {
      failures += slice.length;
      console.error("professional_status_metadata_cleanup_failed");
    } else removed += slice.length;
  }
  return Response.json({ removed, failures, remainingMayExist: batch.length === 80 }, {
    status: failures ? 503 : 200, headers: { "Cache-Control": "no-store" },
  });
}
