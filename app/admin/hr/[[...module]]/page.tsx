import {WorkspaceRoute}from "../../../workspace-route";
export default async function HrPage({params}:{params:Promise<{module?:string[]}>}){const {module=[]}=await params;return <WorkspaceRoute space="hr" moduleKey={module[0]??"dashboard"}/>;}
