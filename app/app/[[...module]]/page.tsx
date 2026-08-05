import { WorkspaceRoute } from "../../workspace-route";
export default async function ClientWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; return <WorkspaceRoute space="client" moduleKey={module[0] ?? "dashboard"} />; }
