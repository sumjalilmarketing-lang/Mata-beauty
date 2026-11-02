import { privateMetadata } from "@/lib/metadata/private";
import type { Metadata } from "next";
export const metadata: Metadata = {
  ...privateMetadata,
  title: "Mata Beauty — Super Admin",
  applicationName: "Mata Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Mata Admin", statusBarStyle: "default" },
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
