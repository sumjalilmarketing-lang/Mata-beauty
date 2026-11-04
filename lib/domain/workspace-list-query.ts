import type { SupabaseClient } from "@supabase/supabase-js";

export const workspacePageSize = 50;

// Only selected, textual columns are searched. Never interpolate a table or
// column supplied by the user, or apply ILIKE to enum/UUID columns.
const textColumns: Record<string, readonly string[]> = {
  profiles: ["first_name", "last_name"], provider_profiles: ["business_name", "city"],
  businesses: ["name", "city"], collaborators: ["display_name", "title"],
  provider_services: ["title"], posts: ["caption"], reviews: ["comment"],
  reports: ["reason"], audit_logs: ["action"], onboarding_events: ["reason"],
  moderation_actions: ["reason"], financial_audit_log: ["action", "transaction_reference"],
  financial_security_events: ["transaction_reference"], disputes: ["reason"],
  promotions: ["title"], notification_campaigns: ["title"],
  app_settings: ["key", "description"], account_deletion_requests: ["reason"],
  notifications: ["title", "body"], messages: ["body"], refunds: ["reason"],
};

export function workspacePage(value: string | null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= Math.floor(Number.MAX_SAFE_INTEGER / workspacePageSize) ? number : 1;
}

function primaryKey(table: string) {
  return table === "provider_profiles" ? "profile_id" : table === "wallet_balances" ? "wallet_id" : table === "app_settings" ? "key" : "id";
}

function quotedPattern(value: string) {
  // Escape both PostgREST quoted-value syntax and LIKE metacharacters. A user
  // comma, quote or parenthesis cannot add an OR expression.
  const pattern = `%${value.replace(/[\\%_*]/g, character => `\\${character}`)}%`;
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function uuid(value: string) {
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}

export function workspaceSearchFilter(table: string, select: string, value: string) {
  const query = value.trim().slice(0, 160);
  if (!query) return null;
  const columns = new Set(select.split(",").map(column => column.trim()));
  const terms = (textColumns[table] ?? []).filter(column => columns.has(column)).map(column => `${column}.ilike.${quotedPattern(query)}`);
  const key = primaryKey(table);
  const hex = query.replaceAll("-", "").toLowerCase();
  const numericKey = ["financial_audit_log", "financial_security_events"].includes(table);
  if (numericKey && /^\d{1,19}$/.test(query) && BigInt(query) <= BigInt("9223372036854775807")) {
    terms.push(`${key}.eq.${query}`);
  } else if (!numericKey && key !== "key" && /^[0-9a-f]{3,32}$/.test(hex)) {
    terms.push(`and(${key}.gte.${uuid(hex.padEnd(32,"0"))},${key}.lte.${uuid(hex.padEnd(32,"f"))})`);
  }
  // No match instead of silently ignoring an unsupported reference search.
  return terms.length ? terms.join(",") : `${key}.is.null`;
}

export function workspaceListQuery(client: SupabaseClient, resource: { table: string; select: string }, options: { page: number; query: string; signal: AbortSignal }) {
  const { table, select } = resource;
  let request = client.from(table).select(select, { count: "exact" }).abortSignal(options.signal);
  const search = workspaceSearchFilter(table, select, options.query);
  if (search) request = request.or(search);
  if (select.split(",").includes("created_at")) request = request.order("created_at", { ascending: false });
  request = request.order(primaryKey(table), { ascending: true });
  const from = (options.page - 1) * workspacePageSize;
  return request.range(from, from + workspacePageSize - 1);
}
