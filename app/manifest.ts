import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mata Beauty",
    short_name: "Mata Beauty",
    description: "Réservez vos prestations beauté premium au Sénégal.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f3eb",
    theme_color: "#240a19",
    lang: "fr",
    orientation: "portrait-primary",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
