import { SuperAdminApp } from "../../super-admin";
import { requireWorkspace } from "@/lib/auth/workspace-server";
import "../admin.css";
import "../launch.css";

export const dynamic = "force-dynamic";

export default async function DepartmentTeamsPage() {
  await requireWorkspace("admin", "agents");
  return <SuperAdminApp initialModule="teams" supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} />;
}
