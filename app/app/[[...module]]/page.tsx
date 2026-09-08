import { WorkspaceRoute } from "../../workspace-route";
import { MataBeautyApp } from "../../mata-beauty-app";
export default async function ClientWorkspace({ params }: { params: Promise<{ module?: string[] }> }) {
  const { module = [] } = await params;
  if (!module.length || ["dashboard", "feed", "discover"].includes(module[0])) return <MataBeautyApp supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} initialScreen={module[0] === "discover" ? "home" : "feed"} />;
  return <WorkspaceRoute space="client" moduleKey={module[0] === "menu" ? "profile" : module[0]} />;
}
