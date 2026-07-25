import type { Metadata, Viewport } from "next";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mata Beauty — Votre beauté, notre passion", template: "%s · Mata Beauty" },
  description: "Réservez les meilleurs professionnels de beauté vérifiés à Dakar. Coiffure, tresses, maquillage, onglerie et soins premium.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  applicationName: "Mata Beauty",
  keywords: ["beauté Dakar", "coiffure Sénégal", "tresses Dakar", "maquillage", "onglerie", "réservation beauté"],
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Mata Beauty — Votre beauté, notre passion",
    description: "L’expérience premium pour réserver les meilleurs professionnels de beauté au Sénégal.",
    type: "website",
    locale: "fr_SN",
    images: [{ url: "/mata-founder-hero.png", width: 1536, height: 1024, alt: "Mata Beauty — Votre beauté, notre passion." }],
  },
  twitter: { card: "summary_large_image", title: "Mata Beauty", description: "Votre beauté, notre passion.", images: ["/mata-founder-hero.png"] },
};

export const viewport: Viewport = { themeColor: "#240a19", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PwaRegister />{children}</body></html>;
}
