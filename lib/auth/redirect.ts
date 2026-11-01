export type OAuthIntent = "client" | "professional";

export function normalizeOAuthIntent(value: string | null): OAuthIntent {
  return value === "professional" ? "professional" : "client";
}

export function safeOAuthDestination(value: string | null) {
  if (!value) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) return "/";
    const url = new URL(decoded, "https://mata.invalid");
    if (url.origin !== "https://mata.invalid" || url.pathname === "/auth/callback") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function intendedRoleForDestination(destination: string | null): "client" | "provider" {
  const safe = safeOAuthDestination(destination);
  return safe.startsWith("/pro") || safe.startsWith("/provider") || safe.startsWith("/salon") ? "provider" : "client";
}

export function oauthErrorCode(error: string | null, description: string | null) {
  if (error === "access_denied") return "google_cancelled";
  if (error || description) return "google_provider_error";
  return null;
}
