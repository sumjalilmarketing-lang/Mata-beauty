import { WorkspaceRoute } from "../../workspace-route";
export default async function ProWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; return <WorkspaceRoute space="pro" moduleKey={module[0] ?? "dashboard"} />; }
