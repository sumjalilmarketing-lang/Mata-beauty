import { WorkspaceRoute } from "../../workspace-route";
import { SuperAdminApp } from "../../super-admin";
import { requireWorkspace } from "@/lib/auth/workspace-server";
import "../admin.css";
import "../launch.css";

// These URLs must use the same working screens as the main administration menu.
// Keep the server-side workspace permission check before rendering any screen.
const connectedModules = {
  activity: "audit",
  health: "platform-health",
  clients: "users",
  providers: "providers",
  agents: "administrators",
  roles: "roles",
  permissions: "roles",
  services: "services",
  categories: "categories",
  bookings: "bookings",
  videos: "content",
  "social-reports": "reports",
  tickets: "support",
  transactions: "payments",
  commissions: "commissions",
  payouts: "payouts",
  kyc: "verification",
  validations: "verification",
  "platform-settings": "settings",
  audit: "audit",
} as const;

export default async function AdminModule({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (Object.hasOwn(connectedModules, module)) {
    await requireWorkspace("admin", module);
    return <SuperAdminApp
      initialModule={connectedModules[module as keyof typeof connectedModules]}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
    />;
  }
  return <WorkspaceRoute space="admin" moduleKey={module} />;
}
