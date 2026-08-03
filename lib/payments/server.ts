import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

function publicConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Configuration Supabase publique absente.");
  return { url, anonKey };
}

export async function authenticatedSupabase(request: Request): Promise<{ client: SupabaseClient; user: User } | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const { url, anonKey } = publicConfiguration();
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : { client, user: data.user };
}

export function serviceSupabase() {
  const { url } = publicConfiguration();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente du serveur.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function jsonError(message: string, status: number, code: string) {
  return Response.json({ ok: false, error: { code, message } }, { status });
}
