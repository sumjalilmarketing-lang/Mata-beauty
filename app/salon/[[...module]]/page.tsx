import { notFound } from "next/navigation";
import { WorkspaceRoute } from "../../workspace-route";
export default async function SalonWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; if (module.length > 1) notFound(); return <WorkspaceRoute space="salon" moduleKey={module[0] ?? "dashboard"} />; }
