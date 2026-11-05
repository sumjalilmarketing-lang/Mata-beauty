import { NextResponse } from "next/server";
import { applicationOrigin } from "@/lib/payments/server";
import { normalizeOAuthIntent, oauthErrorCode, safeOAuthDestination } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/welcome";

function callbackRedirect(request: Request, parameters: Record<string, string>, fallback = "/") {
  const requested = new URL(request.url).searchParams.get("next");
  const destination = requested ? safeOAuthDestination(requested) : fallback;
  // Errors must reach the public login UI; protected pages would redirect again
  // and discard the error. Keep the destination for the next login attempt.
  const url = new URL(parameters.auth_error ? "/" : destination, applicationOrigin(request));
  if (parameters.auth_error && destination !== "/") {
    url.searchParams.set("returnTo", destination);
    url.searchParams.set("connexion", "requise");
  }
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const providerError = oauthErrorCode(parameters.get("error"), parameters.get("error_description"));
  if (providerError) return callbackRedirect(request, { auth_error: providerError });

  const code = parameters.get("code");
  if (!code || code.length > 2048) return callbackRedirect(request, { auth_error: "invalid_callback" });
  const intent = normalizeOAuthIntent(parameters.get("intent"));

  try {
    const supabase = await createSupabaseServerClient(request);
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return callbackRedirect(request, { auth_error: "oauth_exchange_failed" });
    const { data: ensured, error: profileError } = await supabase.rpc("ensure_authenticated_profile");
    if (profileError) {
      await supabase.auth.signOut();
      return callbackRedirect(request, { auth_error: "profile_creation_failed" });
    }
    const { error: statusError } = await supabase.rpc("synchronize_account_status");
    if (statusError) return callbackRedirect(request, { auth_error: "profile_creation_failed" });
    if (intent === "professional") {
      const { error: professionalError } = await supabase.rpc("request_professional_profile");
      if (professionalError) return callbackRedirect(request, { auth_error: "professional_request_failed" });
    }
    const profile = ensured as { role?: string; is_suspended?: boolean; profile_incomplete?: boolean } | null;
    if (profile?.is_suspended) {
      await supabase.auth.signOut();
      return callbackRedirect(request, { auth_error: "account_suspended" });
    }
    const { data: authenticated } = await supabase.auth.getUser();
    if (authenticated.user) {
      try { await sendWelcomeEmail(authenticated.user.id); }
      catch { /* Email delivery must not block a valid OAuth session. */ }
    }
    // The role comes from the database RPC, never the OAuth intent or metadata.
    // Preserve explicit deep links, but route generic admin logins through the
    // existing department/MFA resolver instead of the client space.
    const next = safeOAuthDestination(parameters.get("next"));
    if (profile?.role === "admin" && ["/", "/app", "/app/profile"].includes(next)) {
      return NextResponse.redirect(new URL("/auth/workspace", applicationOrigin(request)), {
        status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
      });
    }
    return callbackRedirect(request, {
      auth: "google",
      intent,
      profile: profile?.profile_incomplete ? "incomplete" : "complete",
    }, intent === "professional" ? "/pro" : "/app");
  } catch {
    return callbackRedirect(request, { auth_error: "oauth_unavailable" });
  }
}
