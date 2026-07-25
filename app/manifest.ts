import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mata Beauty",
    short_name: "Mata Beauty",
    description: "Réservez vos prestations beauté premium au Sénégal.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#160b15",
    theme_color: "#160b15",
    lang: "fr",
    orientation: "any",
    categories: ["beauty", "lifestyle"],
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
