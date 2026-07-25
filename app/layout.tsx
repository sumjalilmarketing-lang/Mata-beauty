import type { Metadata, Viewport } from "next";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mata Beauty — Réservez votre beauté à Dakar", template: "%s · Mata Beauty" },
  description: "Recherchez et réservez des prestations beauté auprès de professionnels vérifiés au Sénégal.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  applicationName: "Mata Beauty",
  keywords: ["beauté Dakar", "coiffure Sénégal", "tresses Dakar", "maquillage", "onglerie", "réservation beauté"],
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Mata Beauty — L’application beauté du Sénégal",
    description: "Trouvez un professionnel, consultez ses disponibilités et réservez votre rendez-vous.",
    type: "website",
    locale: "fr_SN",
    images: [{ url: "/images/categories/mata-category-atlas.webp", width: 1984, height: 792, alt: "Les univers beauté de Mata Beauty." }],
  },
  twitter: { card: "summary_large_image", title: "Mata Beauty", description: "Réservez votre beauté au Sénégal.", images: ["/images/categories/mata-category-atlas.webp"] },
};

export const viewport: Viewport = { themeColor: "#160b15", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PwaRegister />{children}</body></html>;
}
