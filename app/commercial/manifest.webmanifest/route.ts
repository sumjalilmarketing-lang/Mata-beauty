import type { MetadataRoute } from "next";

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/commercial",
    name: "Mata Beauty — Développement commercial",
    short_name: "Mata Commercial",
    description: "Votre espace de développement commercial Mata Beauty.",
    start_url: "/commercial",
    // The commercial installation can also open the feed and client workspace.
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
      { name: "Mon espace commercial", url: "/commercial" },
      { name: "Mon espace client", url: "/app" },
      { name: "Découvrir le feed", url: "/" },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
