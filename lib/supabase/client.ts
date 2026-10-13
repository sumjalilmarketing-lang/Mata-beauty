import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let publicMediaClient: SupabaseClient | null = null;
let runtimeConfiguration: { url: string; anonKey: string } | null = null;

export function configureSupabaseBrowserClient(configuration: { url: string; anonKey: string }) {
  const normalized = { url: configuration.url.trim(), anonKey: configuration.anonKey.trim() };
  if (runtimeConfiguration?.url !== normalized.url || runtimeConfiguration?.anonKey !== normalized.anonKey) {
    runtimeConfiguration = normalized;
    browserClient = null;
    publicMediaClient = null;
  }
}

export function getSupabaseConfiguration() {
  const url = runtimeConfiguration?.url || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = runtimeConfiguration?.anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function getSupabaseBrowserClient() {
  const configuration = getSupabaseConfiguration();
  if (!configuration.configured) return null;
  browserClient ??= createBrowserClient(configuration.url, configuration.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      persistSession: true,
    },
  });
  return browserClient;
}

/**
 * Creates signed URLs for public-feed media without forwarding a possibly
 * expired user access token. Storage RLS still decides which objects are
 * readable; this client uses only the publishable/anon key.
 */
export function getSupabasePublicMediaClient() {
  const configuration = getSupabaseConfiguration();
  if (!configuration.configured) return null;
  publicMediaClient ??= createClient(configuration.url, configuration.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return publicMediaClient;
}
