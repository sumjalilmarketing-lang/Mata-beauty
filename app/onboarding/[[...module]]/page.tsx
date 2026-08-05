import { WorkspaceRoute } from "../../workspace-route";
export default async function OnboardingWorkspace({ params }: { params: Promise<{ module?: string[] }> }) { const { module = [] } = await params; return <WorkspaceRoute space="onboarding" moduleKey={module[0] ?? "dashboard"} />; }
