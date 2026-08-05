import { WorkspaceRoute } from "../../workspace-route";
export default async function FinanceWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; return <WorkspaceRoute space="finance" moduleKey={module[0] ?? "dashboard"} />; }
