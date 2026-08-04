import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let runtimeConfiguration: { url: string; anonKey: string } | null = null;

export function configureSupabaseBrowserClient(configuration: { url: string; anonKey: string }) {
  const normalized = { url: configuration.url.trim(), anonKey: configuration.anonKey.trim() };
  if (runtimeConfiguration?.url !== normalized.url || runtimeConfiguration?.anonKey !== normalized.anonKey) {
    runtimeConfiguration = normalized;
    browserClient = null;
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
