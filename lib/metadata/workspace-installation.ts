import type { Metadata, MetadataRoute } from "next";
import { privateMetadata } from "./private";

export const workspaceInstallations = {
  hr:{prefix:"/admin/hr",name:"Mata Beauty — Ressources humaines",shortName:"Mata RH"},
  client: { prefix: "/app", name: "Mata Beauty — Espace client", shortName: "Mata Client" },
  pro: { prefix: "/pro", name: "Mata Beauty — Espace professionnel", shortName: "Mata Pro" },
  salon: { prefix: "/salon", name: "Mata Beauty — Gestion du salon", shortName: "Mata Salon" },
  staff: { prefix: "/staff", name: "Mata Beauty — Équipe du salon", shortName: "Mata Équipe" },
  finance: { prefix: "/finance", name: "Mata Beauty — Espace financier", shortName: "Mata Finance" },
  support: { prefix: "/support-agent", name: "Mata Beauty — Service client", shortName: "Mata Support" },
  onboarding: { prefix: "/onboarding", name: "Mata Beauty — Vérification des professionnels", shortName: "Mata Dossiers" },
  moderation: { prefix: "/moderation", name: "Mata Beauty — Modération", shortName: "Mata Modération" },
  operations: { prefix: "/operations", name: "Mata Beauty — Opérations", shortName: "Mata Opérations" },
} as const;

export type InstallableWorkspace = keyof typeof workspaceInstallations;

export function workspaceInstallationMetadata(space: InstallableWorkspace): Metadata {
  const definition = workspaceInstallations[space];
  return {
    ...privateMetadata,
    title: definition.name,
    applicationName: definition.shortName,
    manifest: `${definition.prefix}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: definition.shortName, statusBarStyle: "default" },
  };
}

export function workspaceInstallationManifest(space: InstallableWorkspace): MetadataRoute.Manifest {
  const definition = workspaceInstallations[space];
  return {
    id: definition.prefix,
    name: definition.name,
    short_name: definition.shortName,
    description: `Accédez directement à votre espace ${definition.shortName}.`,
    start_url: definition.prefix,
    // Keep navigation between the feed and the user's authorised spaces in-app.
    scope: "/",
    display: "standalone",
    background_color: "#fff9f6",
    theme_color: "#5b0b45",
    lang: "fr",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: definition.shortName, url: definition.prefix },
      { name: "Découvrir le feed", url: "/" },
    ],
  };
}

export function workspaceInstallationResponse(space: InstallableWorkspace) {
  return Response.json(workspaceInstallationManifest(space), { headers: {
    "Content-Type": "application/manifest+json",
    "Cache-Control": "public, max-age=0, must-revalidate",
  } });
}
