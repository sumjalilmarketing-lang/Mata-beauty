import { WorkspaceRoute } from "../../workspace-route";
import { MataBeautyApp } from "../../mata-beauty-app";
import { redirect } from "next/navigation";
type SearchParams = Record<string, string | string[] | undefined>;
export default async function ClientWorkspace({ params, searchParams }: { params: Promise<{ module?: string[] }>; searchParams?: Promise<SearchParams> }) {
  const { module = [] } = await params;
  if (module[0] === "settings") redirect("/app/profile?edit=1");
  if (module[0] === "social-profile") redirect("/app/profile");
  if (module[0] === "discover") {
    const legacy = await searchParams;
    const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
    const query = first(legacy?.q) ?? first(legacy?.query);
    const category = first(legacy?.category);
    const categoryId = first(legacy?.categoryId);
    const zone = first(legacy?.zone);
    const providerId = first(legacy?.providerId);
    const values = new URLSearchParams();
    if (query || category || categoryId || zone || providerId || first(legacy?.screen) === "results") {
      values.set("search", "1"); values.set("applied", "1");
      if (query) values.set("q", query.slice(0, 120));
      if (category) values.set("category", category.slice(0, 100));
      if (categoryId) values.set("categoryId", categoryId);
      if (zone) values.set("zone", zone.slice(0, 120));
      if (providerId) values.set("providerId", providerId);
    }
    redirect(values.size ? `/?${values.toString()}` : "/");
  }
  if (!module.length || ["dashboard", "feed"].includes(module[0])) return <MataBeautyApp supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} initialScreen="feed" />;
  return <WorkspaceRoute space="client" moduleKey={module[0] === "menu" ? "profile" : module[0]} />;
}
