import { NextResponse } from "next/server";
import { applicationOrigin } from "@/lib/payments/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/welcome";

function redirect(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, applicationOrigin(request)), {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

// Email confirmation is separate from the Google OAuth callback. Token hashes
// also work when the user opens their email on a different device/browser.
export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const type = parameters.get("type");
  const hash = parameters.get("token_hash");
  const code = parameters.get("code");
  const validType = type === "signup" || type === "invite" || type === "recovery";
  const failure = "/?connexion=requise&auth_error=email_link_invalid";
  if (parameters.has("error") || parameters.has("error_code")) return redirect(request, failure);
  if ((!hash || hash.length > 2048 || !validType) && (!code || code.length > 2048)) return redirect(request, failure);
  try {
    const client = await createSupabaseServerClient(request);
    const { error } = hash && validType
      ? await client.auth.verifyOtp({ token_hash: hash, type })
      : await client.auth.exchangeCodeForSession(code!);
    if (error) return redirect(request, failure);
    const { data, error: userError } = await client.auth.getUser();
    if (userError || !data.user) return redirect(request, failure);
    const { data: profile, error: profileError } = await client.rpc("ensure_authenticated_profile");
    const { error: statusError } = await client.rpc("synchronize_account_status");
    if (profileError || statusError || profile?.is_suspended) {
      await client.auth.signOut();
      return redirect(request, "/?auth_error=profile_creation_failed");
    }
    if (type === "recovery" || type === "invite") {
      return redirect(request, `/auth/update-password?mode=${type}`);
    }
    try { await sendWelcomeEmail(data.user.id); }
    catch { console.error("welcome_email_delivery_failed"); }
    return redirect(request, "/app/profile?auth=email_confirmed");
  } catch {
    return redirect(request, "/?connexion=requise&auth_error=email_confirmation_unavailable");
  }
}
