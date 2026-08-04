export type OAuthIntent = "client" | "professional";

export function normalizeOAuthIntent(value: string | null): OAuthIntent {
  return value === "professional" ? "professional" : "client";
}

export function safeOAuthDestination(value: string | null) {
  if (!value) return "/";
  try {
    const decoded = decodeURIComponent(value);
    return decoded === "/" ? decoded : "/";
  } catch {
    return "/";
  }
}

export function oauthErrorCode(error: string | null, description: string | null) {
  if (error === "access_denied") return "google_cancelled";
  if (error || description) return "google_provider_error";
  return null;
}
