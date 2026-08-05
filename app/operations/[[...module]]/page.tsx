import { WorkspaceRoute } from "../../workspace-route";
export default async function OperationsWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; return <WorkspaceRoute space="operations" moduleKey={module[0] ?? "dashboard"} />; }
