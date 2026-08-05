import { WorkspaceRoute } from "../../workspace-route";
export default async function ModerationWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; return <WorkspaceRoute space="moderation" moduleKey={module[0] ?? "dashboard"} />; }
