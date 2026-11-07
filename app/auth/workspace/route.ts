import { NextResponse } from "next/server";
import { applicationOrigin } from "@/lib/payments/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { internalWorkspaceDestination } from "@/lib/auth/workspace-access";

/** Resolve only the verified session's database roles. Query-string roles and
 * destinations never confer access, and MFA remains mandatory. */
export async function GET(request: Request) {
  const go = (path: string) => NextResponse.redirect(new URL(path, applicationOrigin(request)), {
    status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  try {
    const client = await createSupabaseServerClient(request);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return go("/?connexion=requise&returnTo=%2Fauth%2Fworkspace");
    const profile = await client.rpc("get_my_private_profile");
    if (profile.error || !profile.data) return go("/?auth_error=workspace_unavailable");
    if (profile.data.is_suspended || profile.data.account_status !== "active") {
      return go("/?auth_error=account_suspended");
    }
    if (profile.data.role !== "admin") return go("/app/profile");
    const mfa = await client.rpc("admin_mfa_required");
    if (mfa.error) return go("/?auth_error=workspace_unavailable");
    // The shared verification screen returns to the actual department once
    // the second factor is verified; this does not expose Super Admin modules.
    if (mfa.data === true) return go("/admin");
    const context = await client.rpc("get_admin_context");
    const roles: unknown = context.data?.roles;
    const destination = !context.error && Array.isArray(roles)
      ? internalWorkspaceDestination(roles.filter((role): role is string => typeof role === "string")) : null;
    return go(destination ?? "/?acces=refuse");
  } catch {
    return go("/?auth_error=workspace_unavailable");
  }
}
