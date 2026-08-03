import { createHash, randomUUID } from "node:crypto";
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
  return Response.json({ ok: false, error: { code, message }, requestId: randomUUID() }, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function requestContext(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const pepper = process.env.PAYMENT_SECURITY_PEPPER ?? process.env.PAYMENT_WEBHOOK_SECRET ?? "";
  const ipHash = pepper ? createHash("sha256").update(`${pepper}:${forwarded}`).digest("hex") : "unavailable";
  return { requestId, ipHash };
}

export function requestFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const expected = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try { return new URL(origin).origin === new URL(expected).origin; } catch { return false; }
}

export async function consumeRateLimit(input: { scope: string; key: string; limit: number; windowSeconds: number }) {
  const pepper = process.env.PAYMENT_SECURITY_PEPPER ?? process.env.PAYMENT_WEBHOOK_SECRET ?? "";
  if (!pepper) return process.env.NODE_ENV !== "production";
  const keyHash = createHash("sha256").update(`${pepper}:${input.key}`).digest("hex");
  const { data, error } = await serviceSupabase().rpc("consume_financial_rate_limit", {
    target_scope: input.scope,
    target_key_hash: keyHash,
    target_limit: input.limit,
    target_window_seconds: input.windowSeconds,
  });
  if (error) throw new Error("Le contrôle de débit est indisponible.");
  return data === true;
}
