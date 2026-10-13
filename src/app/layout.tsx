import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import { DEFAULT_DESCRIPTION, siteUrl } from "@/lib/seo";

// Fredoka: títulos arredondados e amigáveis (fofo/artesanal). Nunito: corpo legível e suave.
const display = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const body = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "AHL Studio — Impressão 3D personalizada em Americana/SP", template: "%s · AHL Studio" },
  description: DEFAULT_DESCRIPTION,
  keywords: ["impressão 3D", "Americana SP", "funko personalizado", "boneco personalizado pet", "chaveiro personalizado", "placa avaliação Google NFC", "cartão de visita NFC", "presente personalizado"],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AHL Studio", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  applicationName: "AHL Studio",
  openGraph: { type: "website", locale: "pt_BR", siteName: "AHL Studio" },
  twitter: { card: "summary_large_image" },
};

export const viewport = { themeColor: "#F4AFAB", width: "device-width", initialScale: 1, viewportFit: "cover" as const };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
