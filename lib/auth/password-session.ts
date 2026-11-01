import type { SupabaseClient } from "@supabase/supabase-js";

export type PasswordReturn =
  | { kind: "error"; code: string }
  | { kind: "tokens"; accessToken: string; refreshToken: string; invitation: boolean }
  | { kind: "code"; code: string }
  | { kind: "session" };

// Invitations and links opened on another device can still use an implicit
// return. Keep the application's PKCE client and explicitly import this session.
export function readPasswordReturn(url: URL): PasswordReturn {
  const fragment = new URLSearchParams(url.hash.slice(1));
  const error = fragment.get("error_code") || url.searchParams.get("error_code")
    || fragment.get("error") || url.searchParams.get("error");
  if (error) return { kind: "error", code: error };
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken || refreshToken) {
    const type = fragment.get("type");
    if (!accessToken || !refreshToken || (type !== "invite" && type !== "recovery")) {
      return { kind: "error", code: "invalid_email_link" };
    }
    return { kind: "tokens", accessToken, refreshToken, invitation: type === "invite" };
  }
  const code = url.searchParams.get("code");
  return code ? { kind: "code", code } : { kind: "session" };
}

export async function restorePasswordSession(client: SupabaseClient, result: PasswordReturn) {
  if (result.kind === "error") throw { code: result.code };
  if (result.kind === "tokens") {
    const { error } = await client.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken });
    if (error) throw error;
  } else if (result.kind === "code") {
    const { error } = await client.auth.exchangeCodeForSession(result.code);
    if (error) throw error;
  }
  // Validate with Auth, rather than trusting URL parameters or a local cookie.
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw { code: "session_not_found" };
}
