type CspEnvironment = Readonly<{
  NODE_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?: string;
  MATA_E2E_NEXT_DIST_DIR?: string;
}>;

export function usesWorkspaceNonce(pathname: string, accept: string | null): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return Boolean(accept?.includes("text/html"))
    && /^\/(account|app|pro|salon|staff|admin|commercial|finance|support-agent|moderation|operations|onboarding|auth)(\/|$)/.test(path)
    && !/\.[a-z0-9]+$/i.test(path);
}

/** Nonces are reserved for already-dynamic workspace HTML, not cached SSG pages. */
export function contentSecurityPolicy(environment: CspEnvironment, nonce?: string, reportOnly = false): string {
  if (nonce && !/^[A-Za-z0-9+/]+={0,2}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  const origin = environment.NEXT_PUBLIC_SUPABASE_URL ? new URL(environment.NEXT_PUBLIC_SUPABASE_URL).origin : null;
  const frames = [origin ? `${origin}/storage/v1/object/sign/provider-documents/` : "", environment.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ? "https://www.google.com" : ""].filter(Boolean);
  const scriptSources = ["'self'", nonce ? `'nonce-${nonce}' 'strict-dynamic'` : reportOnly ? "" : "'unsafe-inline'", "'wasm-unsafe-eval'", environment.NODE_ENV === "development" ? "'unsafe-eval'" : ""].filter(Boolean).join(" ");
  return [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'",
    `frame-src ${frames.length ? frames.join(" ") : "'none'"}`, "object-src 'none'",
    "form-action 'self' https://app.paydunya.com", "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https://*.supabase.co", "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'", "worker-src 'self'", `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    `connect-src 'self'${origin ? ` ${origin}` : ""} https://*.supabase.co wss://*.supabase.co https://app.paydunya.com`,
    environment.NODE_ENV === "production" && !environment.MATA_E2E_NEXT_DIST_DIR ? "upgrade-insecure-requests" : "",
  ].filter(Boolean).join("; ");
}
