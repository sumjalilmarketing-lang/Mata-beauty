import { z } from "zod";
import { anonymousAnalyticsKey } from "@/lib/analytics/server";
import { hasTrustedOrigin, serviceSupabase } from "@/lib/payments/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";
export const runtime = "nodejs";
const base = { target_post_id: z.uuid(), target_session_hash: z.string().regex(/^[a-f0-9]{64}$/) };
const input = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("record_video_view"), target_watched_ms: z.number().int().min(0).max(86400000), target_completed: z.boolean() }).strict(),
  z.object({ ...base, kind: z.literal("record_post_share") }).strict(),
  z.object({ ...base, kind: z.literal("record_post_booking_click") }).strict(),
  z.object({ ...base, kind: z.literal("record_social_profile_visit"), target_provider_id: z.uuid() }).strict(),
]);
function response(status: number, data: unknown = null) {
  return Response.json({ data }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return response(403);
  try {
    const parsed = input.safeParse(JSON.parse(await readBoundedText(request, 2048)));
    if (!parsed.success) return response(400);
    const client = await createSupabaseServerClient(request);
    const { data: { user }, error } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") return response(503);
    const { kind, ...parameters } = parsed.data;
    if (user) {
      const result = await client.rpc(kind, parameters);
      return result.error ? response(503) : response(200, result.data);
    }
    const key = anonymousAnalyticsKey(request);
    if (!key) return response(503);
    const result = await serviceSupabase().rpc("record_anonymous_social_metric", { ...parameters, target_kind: kind, target_ip_hash: key });
    if (result.error) return response(503);
    return result.data?.accepted === true ? response(200, result.data.data) : response(429);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return response(413);
    if (error instanceof SyntaxError) return response(400);
    return response(503);
  }
}
