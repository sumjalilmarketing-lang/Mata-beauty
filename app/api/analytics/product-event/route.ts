import { z } from "zod";
import { anonymousAnalyticsKey } from "@/lib/analytics/server";
import { hasTrustedOrigin, serviceSupabase } from "@/lib/payments/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const inputSchema = z.object({
  target_event_name: z.enum(["signup_started", "signup_completed", "provider_onboarding_started", "provider_onboarding_completed", "search", "category_viewed", "provider_viewed", "social_post_viewed", "booking_started", "booking_completed", "booking_cancelled", "favorite_added", "message_sent", "social_post_published", "video_to_booking_click", "review_created"]),
  target_session_hash: z.string().regex(/^[a-f0-9]{64}$/),
  target_properties: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).default({}),
}).strict();

function response(status: number) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return response(403);
  // Bound the stream, not just the attacker-supplied Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) return response(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); return response(413); }
      chunks.push(value);
    }
  } catch { return response(400); }
  let parsed: ReturnType<typeof inputSchema.safeParse>;
  try { parsed = inputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { return response(400); }
  if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data.target_properties)) > 8192) return response(400);
  try {
    const client = await createSupabaseServerClient(request);
    // getUser verifies the session with Auth; getSession alone is not authorization.
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") return response(503);
    const key = user ? null : anonymousAnalyticsKey(request);
    if (!user && !key) return response(503);
    const result = user
      ? await client.rpc("record_product_event", parsed.data)
      : await serviceSupabase().rpc("record_anonymous_product_event", { ...parsed.data, target_ip_hash: key });
    if (result.error) return response(503);
    return response(result.data == null ? 429 : 204);
  } catch { return response(503); }
}
