import { workspaceInstallationMetadata } from "@/lib/metadata/workspace-installation";
export const metadata = workspaceInstallationMetadata("finance");
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
