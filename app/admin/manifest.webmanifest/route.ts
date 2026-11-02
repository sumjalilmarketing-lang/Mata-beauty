import type { MetadataRoute } from "next";

// A separate installation identity keeps the client app's launch URL intact.
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/admin",
    name: "Mata Beauty Super Admin",
    short_name: "Mata Admin",
    description: "Administration sécurisée de Mata Beauty.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: "#fff9f6",
    theme_color: "#5b0b45",
    lang: "fr",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=0, must-revalidate" } });
}
