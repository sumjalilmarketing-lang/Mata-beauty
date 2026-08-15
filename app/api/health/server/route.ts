import { serviceSupabase } from "@/lib/payments/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { error } = await serviceSupabase().from("categories").select("id", { count: "exact", head: true });
    if (error) throw error;
    return Response.json({ ok: true, checks: { configuration: true, database: true, serviceRole: true } }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return Response.json({ ok: false, checks: { configuration: false, database: false, serviceRole: false } }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
