import { privateMetadata } from "@/lib/metadata/private";
import type { Metadata } from "next";
export const metadata: Metadata = {
  ...privateMetadata,
  title: "Mata Beauty — Développement commercial",
  applicationName: "Mata Commercial",
  manifest: "/commercial/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Mata Commercial", statusBarStyle: "default" },
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
