import { WorkspaceShell } from "./workspace-shell";
import { WorkspaceModuleView } from "./workspace-module";
import { requireWorkspace } from "@/lib/auth/workspace-server";
import type { WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { workspaceSpaces } from "@/lib/navigation/spaces";
import { canAccessWorkspaceModule } from "@/lib/auth/workspace-access";

export async function WorkspaceRoute({ space, moduleKey }: { space: WorkspaceSpaceKey; moduleKey: string }) {
  const collaboratorAccessEnabled = process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED === "true";
  const normalizedModule = moduleKey === "menu" ? "settings" : moduleKey === "studio" ? "videos" : moduleKey;
  const access = await requireWorkspace(space, normalizedModule);
  const salonWorkflows = new Set(["dashboard", "agenda", "bookings", "team", "services", "videos", "portfolio", "messages", "revenue", "statistics", "reviews", "profile", "settings"]);
  const allowedModuleKeys = workspaceSpaces[space].modules.filter((item) => (space !== "staff" || collaboratorAccessEnabled) && canAccessWorkspaceModule(access.identity, item.permission, item.staffPermission) && (space === "salon" ? salonWorkflows.has(item.key) : (space === "admin" && item.key === "hr") || space === "hr" || Boolean(item.resource) || ["teams","cases"].includes(item.key) || item.key === "dashboard" || (["commercial", "onboarding"].includes(space) && item.key === "documents") || (space === "commercial" && ["crm","follow-ups","field","reports","appointments"].includes(item.key)) || (space === "client" && ["settings", "application"].includes(item.key)) || (space === "pro" && ["settings", "statistics", "portfolio"].includes(item.key)))).map((item) => item.key);
  return <WorkspaceShell space={space} moduleKey={normalizedModule} availableSpaces={access.availableSpaces} allowedModuleKeys={allowedModuleKeys} userEmail={access.userEmail}>
    <WorkspaceModuleView space={space} module={access.module} allowedModuleKeys={allowedModuleKeys} supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} userId={access.userId} canManageCrmAssignments={access.identity.adminRoles.some(role => ["super_admin","commercial_manager"].includes(role))} isSuperAdmin={access.identity.adminRoles.includes("super_admin")} canDecideRefunds={access.identity.permissions.includes("payments.refund")} canReadFinance={access.identity.permissions.includes("payments.read")} canManageSupport={access.identity.permissions.includes("support.manage")} providerApproved={access.providerApproved} staffCanReply={access.identity.staffPermissions.includes("messages.reply")} staffCanManageBookings={access.identity.staffPermissions.includes("bookings.manage")} collaboratorAccessEnabled={collaboratorAccessEnabled} />
  </WorkspaceShell>;
}
