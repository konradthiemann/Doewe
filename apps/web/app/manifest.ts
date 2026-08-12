import type { MetadataRoute } from "next";

/**
 * Web App Manifest — macht Doewe installierbar (PWA).
 * Next.js liefert die Datei unter /manifest.webmanifest aus und verlinkt sie
 * automatisch im <head>. Die Icons liegen statisch in public/icons/
 * (maskable-Varianten mit ~80 % Safe-Zone für Android-Masken).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Doewe",
    short_name: "Doewe",
    description: "Familien-Finanzen: Ausgaben erfassen, Budgets und Sparziele im Blick.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
