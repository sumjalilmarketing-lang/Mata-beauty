import { WorkspaceRoute } from "../../workspace-route";
export default async function AdminModule({ params }: { params: Promise<{ module: string }> }) { const { module } = await params; return <WorkspaceRoute space="admin" moduleKey={module} />; }
