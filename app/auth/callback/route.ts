import { NextResponse } from "next/server";
import { applicationOrigin } from "@/lib/payments/server";
import { normalizeOAuthIntent, oauthErrorCode, safeOAuthDestination } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function callbackRedirect(request: Request, parameters: Record<string, string>) {
  const url = new URL(safeOAuthDestination(new URL(request.url).searchParams.get("next")), applicationOrigin(request));
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { status: 303 });
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
    if (intent === "professional") {
      const { error: professionalError } = await supabase.rpc("request_professional_profile");
      if (professionalError) return callbackRedirect(request, { auth_error: "professional_request_failed" });
    }
    const profile = ensured as { is_suspended?: boolean; profile_incomplete?: boolean } | null;
    if (profile?.is_suspended) {
      await supabase.auth.signOut();
      return callbackRedirect(request, { auth_error: "account_suspended" });
    }
    return callbackRedirect(request, {
      auth: "google",
      intent,
      profile: profile?.profile_incomplete ? "incomplete" : "complete",
    });
  } catch {
    return callbackRedirect(request, { auth_error: "oauth_unavailable" });
  }
}
