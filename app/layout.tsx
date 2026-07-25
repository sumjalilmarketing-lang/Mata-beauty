import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mata Beauty — Réservez votre expert beauté au Sénégal",
  description: "Trouvez, comparez et réservez les meilleurs professionnels de beauté au Sénégal.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "Mata Beauty",
    description: "Votre beauté. Votre moment.",
    type: "website",
    locale: "fr_SN",
    images: [{ url: "/og.png", width: 1734, height: 908, alt: "Mata Beauty — Votre beauté. Votre moment." }],
  },
  twitter: { card: "summary_large_image", title: "Mata Beauty", description: "Votre beauté. Votre moment.", images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#541331", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
