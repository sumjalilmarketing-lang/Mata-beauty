import { WorkspaceRoute } from "../../workspace-route";
export default async function CommercialWorkspace({ params }: { params: Promise<{ module?: string[] }> }) {
  const { module = [] } = await params;
  return <WorkspaceRoute space="commercial" moduleKey={module[0] ?? "dashboard"} />;
}
