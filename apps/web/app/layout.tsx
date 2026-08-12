import "./globals.css";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Inter } from "next/font/google";

import AppChrome from "../components/AppChrome";
import MainContainer from "../components/MainContainer";
import OfflineBanner from "../components/OfflineBanner";

import Providers from "./providers";

import type { Metadata, Viewport } from "next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Doewe",
  description: "Family management: track finances, set goals, detect patterns.",
  // Installierte iOS-Web-App: Vollbild-Modus + eigener Titel auf dem Home-Bildschirm
  appleWebApp: {
    capable: true,
    title: "Doewe",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Inhalte dürfen bis in die Safe-Areas laufen (Bottom-Nav padded bereits via env(safe-area-inset-bottom))
  viewportFit: "cover",
  // Browser-Chrome/Statusbar-Farbe folgt dem OS-Farbschema (bg-white / neutral-900)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" }
  ]
};

// Inline script to prevent flash of wrong theme
const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('doewe-theme') || 'system';
    var resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.add(resolved);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased flex flex-col">
        <a href="#maincontent" className="sr-only">
          Skip to main
        </a>
        <Providers>
          <OfflineBanner />
          <MainContainer>{children}</MainContainer>
          <AppChrome />
        </Providers>
        {/* Vercel Analytics — no cookie banner required, privacy-friendly */}
        <Analytics />
        {/* Core Web Vitals monitoring visible in Vercel Dashboard */}
        <SpeedInsights />
      </body>
    </html>
  );
}
