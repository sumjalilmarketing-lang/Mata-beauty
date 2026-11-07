import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { WorkspaceRoute } from "../../workspace-route";
export default async function CommercialWorkspace({ params,searchParams }: { params: Promise<{module?:string[]}>;searchParams:Promise<{dossier?:string}> }) {
  const {module=[]}=await params; if (module.length > 1) notFound();
  const {dossier}=await searchParams;
  if (!module.length && typeof dossier === "string" && /^[0-9a-f-]{36}$/i.test(dossier)) redirect(`/commercial/dossiers?dossier=${encodeURIComponent(dossier)}`);
  return <WorkspaceRoute space="commercial" moduleKey={module[0] ?? "dashboard"} />;
}
