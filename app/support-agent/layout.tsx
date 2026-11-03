import { workspaceInstallationMetadata } from "@/lib/metadata/workspace-installation";
export const metadata = workspaceInstallationMetadata("support");
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
