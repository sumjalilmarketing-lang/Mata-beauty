import type { SupabaseClient } from "@supabase/supabase-js";

// This is ordinary email verification, with no implicit account creation or
// privileged credentials. Internal users still need the existing MFA checks.
export async function requestEmailSignIn(
  auth: Pick<SupabaseClient["auth"], "signInWithOtp">,
  email: string,
  origin: string,
) {
  const { error } = await auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: new URL("/auth/confirm", origin).toString(),
    },
  });
  // A missing account must not be disclosed by the form's response.
  if (error && !["otp_disabled", "signups_not_allowed", "user_not_found"].includes(error.code ?? "")) throw error;
}
