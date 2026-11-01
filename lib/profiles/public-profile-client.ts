import { createClient } from "@supabase/supabase-js";
import { serviceSupabase } from "@/lib/payments/server";

// Public professional pages must also work in isolated environments without a
// payment service credential. The fallback retains database RLS and cannot read
// private collections or grant access to an unpublished professional.
export function publicProfileClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return serviceSupabase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Configuration Supabase publique absente.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

