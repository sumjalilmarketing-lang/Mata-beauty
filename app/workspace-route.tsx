import { WorkspaceShell } from "./workspace-shell";
import { WorkspaceModuleView } from "./workspace-module";
import { requireWorkspace } from "@/lib/auth/workspace-server";
import type { WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { workspaceSpaces } from "@/lib/navigation/spaces";
import { canAccessWorkspaceModule } from "@/lib/auth/workspace-access";

export async function WorkspaceRoute({ space, moduleKey }: { space: WorkspaceSpaceKey; moduleKey: string }) {
  const collaboratorAccessEnabled = process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED === "true";
  const normalizedModule = space === "pro" && ["settings", "menu"].includes(moduleKey) ? "public-profile" : moduleKey === "menu" ? "dashboard" : moduleKey === "studio" ? "videos" : moduleKey;
  const access = await requireWorkspace(space, normalizedModule);
  const salonWorkflows = new Set(["dashboard", "agenda", "bookings", "team", "services", "videos", "portfolio", "messages", "revenue", "statistics", "reviews", "profile", "settings"]);
  const allowedModuleKeys = workspaceSpaces[space].modules.filter((item) => (space !== "staff" || collaboratorAccessEnabled) && canAccessWorkspaceModule(access.identity, item.permission, item.staffPermission) && (space === "salon" ? salonWorkflows.has(item.key) : Boolean(item.resource) || item.key === "dashboard" || (space === "client" && ["settings", "application"].includes(item.key)) || (space === "pro" && ["settings", "statistics", "portfolio"].includes(item.key)))).map((item) => item.key);
  return <WorkspaceShell space={space} moduleKey={normalizedModule} availableSpaces={access.availableSpaces} allowedModuleKeys={allowedModuleKeys} userEmail={access.userEmail}>
    <WorkspaceModuleView space={space} module={access.module} allowedModuleKeys={allowedModuleKeys} supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} userId={access.userId} providerApproved={access.providerApproved} staffCanReply={access.identity.staffPermissions.includes("messages.reply")} staffCanManageBookings={access.identity.staffPermissions.includes("bookings.manage")} collaboratorAccessEnabled={collaboratorAccessEnabled} />
  </WorkspaceShell>;
}
