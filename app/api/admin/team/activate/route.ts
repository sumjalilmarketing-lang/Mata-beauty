import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applicationOrigin, serviceSupabase } from "@/lib/payments/server";

export async function POST(request: Request) {
  const reply = (ok: boolean, status: number) => Response.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });
  if (request.headers.get("origin") !== new URL(applicationOrigin(request)).origin) return reply(false, 403);
  const client = await createSupabaseServerClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return reply(false, 401);
  // The target comes only from the verified session, never from request input.
  const activated = await serviceSupabase().rpc("activate_internal_invitation", { target_user_id: data.user.id });
  return activated.error || activated.data !== true ? reply(false, 403) : reply(true, 200);
}
