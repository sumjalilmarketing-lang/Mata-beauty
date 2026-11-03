import { workspaceInstallationResponse } from "@/lib/metadata/workspace-installation";

export function GET() { return workspaceInstallationResponse("operations"); }
