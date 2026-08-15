import { WorkspaceShell } from "./workspace-shell";
import { WorkspaceModuleView } from "./workspace-module";
import { requireWorkspace } from "@/lib/auth/workspace-server";
import type { WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { workspaceSpaces } from "@/lib/navigation/spaces";
import { canAccessWorkspaceModule } from "@/lib/auth/workspace-access";

export async function WorkspaceRoute({ space, moduleKey }: { space: WorkspaceSpaceKey; moduleKey: string }) {
  const access = await requireWorkspace(space, moduleKey === "menu" ? "dashboard" : moduleKey);
  const allowedModuleKeys = workspaceSpaces[space].modules.filter((item) => canAccessWorkspaceModule(access.identity, item.permission)).map((item) => item.key);
  return <WorkspaceShell space={space} moduleKey={moduleKey} availableSpaces={access.availableSpaces} allowedModuleKeys={allowedModuleKeys} userEmail={access.userEmail}>
    <WorkspaceModuleView space={space} module={access.module} allowedModuleKeys={allowedModuleKeys} supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} userId={access.userId} providerApproved={access.providerApproved} />
  </WorkspaceShell>;
}
