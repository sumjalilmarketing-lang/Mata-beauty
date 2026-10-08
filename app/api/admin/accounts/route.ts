import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { serviceSupabase } from "@/lib/payments/server";

const input = z.object({ action: z.enum(["preview", "suspend", "archive", "reactivate", "delete"]),
  accounts: z.array(z.object({ userId: z.uuid(), operationId: z.uuid() })).min(1).max(20),
  reason: z.string().trim().max(1000).default(""), confirmation: z.string().max(100).default("")
}).refine(value => new Set(value.accounts.map(account => account.userId)).size === value.accounts.length);
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function manager(request: Request) {
  const client = await createSupabaseServerClient(request);
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) return null;
  const permitted = await client.rpc("admin_list_team");
  return permitted.error ? null : client;
}
export async function GET(request: Request) {
  const client = await manager(request);
  if (!client) return reply({ error: "Super Admin avec MFA requis." }, 403);
  const query = new URL(request.url).searchParams.get("search") ?? "";
  if (query.length > 200) return reply({ error: "Recherche trop longue." }, 400);
  const result = await client.rpc("admin_managed_accounts", { search_term: query || null });
  return result.error ? reply({ error: "La liste des comptes est indisponible." }, 503) : reply({ accounts: result.data });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Origine refusée." }, 403);
  const client = await manager(request);
  if (!client) return reply({ error: "Super Admin avec MFA requis." }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return reply({ error: "Requête invalide." }, 400); }
  const parsed = input.safeParse(body);
  if (!parsed.success) return reply({ error: "Sélection invalide (20 comptes maximum)." }, 400);
  const { action, accounts, reason, confirmation } = parsed.data;
  if (action !== "preview" && reason.length < 5) return reply({ error: "Une justification de cinq caractères minimum est requise." }, 400);
  if (action === "delete" && confirmation !== `SUPPRIMER ${accounts.length} COMPTE${accounts.length > 1 ? "S" : ""}`) return reply({ error: "Confirmation renforcée incorrecte." }, 400);
  const results: Array<{ userId: string; status: string; message?: string; preview?: unknown }> = [];
  for (const account of accounts) {
    if (action === "preview") {
      const result = await client.rpc("admin_account_preview", { target_user_id: account.userId });
      results.push({ userId: account.userId, status: result.error ? "failed" : "ready", ...(result.error ? { message: "Le détail de ce compte est indisponible." } : { preview: result.data }) });
      continue;
    }
    const started = await client.rpc("admin_manage_account", { target_user_id: account.userId, target_action: action, target_reason: reason, operation_id: account.operationId, confirmation: action === "delete" ? "SUPPRIMER" : "" });
    if (started.error) {
      results.push({ userId: account.userId, status: "failed", message: "Opération refusée : vérifiez les permissions, les dépendances et l’état du compte." }); continue;
    }
    const state = started.data as { status: string };
    if (action !== "delete" || state.status !== "pending") {
      results.push({ userId: account.userId, status: state.status }); continue;
    }
    try {
      const service = serviceSupabase();
      // Sessions and login were revoked transactionally before this Auth call.
      // Database triggers recheck retained dependencies during the cascade.
      await service.auth.admin.deleteUser(account.userId);
      const finished = await service.rpc("finish_admin_account_deletion", { operation_id: account.operationId });
      if (finished.error) throw new Error("Unable to confirm deletion");
      const outcome = finished.data as { status: string };
      results.push({ userId: account.userId, status: outcome.status, ...(outcome.status === "failed" ? { message: "Suppression non réalisée. Le compte reste désactivé et ses données conservées." } : {}) });
    } catch {
      results.push({ userId: account.userId, status: "pending", message: "Résultat non confirmé. Réessayez la même opération pour vérifier son résultat, sans réactiver le compte." });
    }
  }
  return reply({ results });
}
