import type { Metadata, Viewport } from "next";
import { PwaRegister } from "./pwa-register";
import "./globals.css";
import "./readability.css";

export const metadata: Metadata = {
  title: { default: "Mata Beauty — Réservez votre beauté près de vous", template: "%s · Mata Beauty" },
  description: "Découvrez les professionnels et salons de beauté au Sénégal et à l’international. Consultez leurs prestations et réservez votre rendez-vous.",
  metadataBase: new URL("https://mata-beauty.com"),
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  applicationName: "Mata Beauty",
  keywords: ["beauté Dakar", "coiffure Sénégal", "tresses Dakar", "maquillage", "onglerie", "réservation beauté"],
  icons: { icon: "/brand/icon-64.png", shortcut: "/brand/icon-64.png", apple: "/brand/icon-192.png" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Mata Beauty — Votre rendez-vous beauté",
    description: "Trouvez un professionnel, consultez ses disponibilités et réservez votre rendez-vous.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 908, alt: "Mata Beauty — prestations beauté près de vous." }],
  },
  twitter: { card: "summary_large_image", title: "Mata Beauty", description: "Réservez votre beauté près de vous.", images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#5b0b45", colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PwaRegister />{children}</body></html>;
}
