import { notFound, redirect } from "next/navigation";
import { WorkspaceRoute } from "../../workspace-route";
export default async function ProWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; if (module.length > 1) notFound(); if (module[0] === "services") redirect("/salon/services"); return <WorkspaceRoute space="pro" moduleKey={module[0] ?? "dashboard"} />; }
