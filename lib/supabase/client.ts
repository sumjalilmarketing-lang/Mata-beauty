import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let runtimeConfiguration: { url: string; anonKey: string } | null = null;
type ViteImportMeta = ImportMeta & { env: Record<string, string | undefined> };
const viteEnvironment = (import.meta as ViteImportMeta).env;

export function configureSupabaseBrowserClient(configuration: { url: string; anonKey: string }) {
  const normalized = { url: configuration.url.trim(), anonKey: configuration.anonKey.trim() };
  if (runtimeConfiguration?.url !== normalized.url || runtimeConfiguration?.anonKey !== normalized.anonKey) {
    runtimeConfiguration = normalized;
    browserClient = null;
  }
}

export function getSupabaseConfiguration() {
  const url = runtimeConfiguration?.url || viteEnvironment.VITE_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = runtimeConfiguration?.anonKey || viteEnvironment.VITE_SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function getSupabaseBrowserClient() {
  const configuration = getSupabaseConfiguration();
  if (!configuration.configured) return null;
  browserClient ??= createClient(configuration.url, configuration.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  return browserClient;
}
