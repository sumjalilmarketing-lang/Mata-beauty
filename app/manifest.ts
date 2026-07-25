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
    background_color: "#fff9f6",
    theme_color: "#5b0b45",
    lang: "fr",
    orientation: "any",
    categories: ["beauty", "lifestyle"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
