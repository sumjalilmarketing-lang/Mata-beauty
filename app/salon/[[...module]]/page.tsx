import { WorkspaceRoute } from "../../workspace-route";
export default async function SalonWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; return <WorkspaceRoute space="salon" moduleKey={module[0] ?? "dashboard"} />; }
