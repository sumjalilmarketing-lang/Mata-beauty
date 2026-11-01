import { authenticatedSupabase, hasTrustedOrigin } from "@/lib/payments/server";
import { sendWelcomeEmail } from "@/lib/email/welcome";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return Response.json({ error: "origin_rejected" }, { status: 403 });
  const auth = await authenticatedSupabase(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const status = await sendWelcomeEmail(auth.user.id);
    return Response.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("welcome_email_delivery_failed");
    return Response.json({ error: "delivery_pending" }, { status: 503 });
  }
}
