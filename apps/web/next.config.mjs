import { randomUUID } from "node:crypto";

import withSerwistInit from "@serwist/next";

/**
 * Serwist (Service Worker) — nur im Production-Build aktiv.
 * Die Offline-Fallback-Seite wird zusätzlich precached; die revision ist pro
 * Build neu, damit die Seite nach jedem Deployment aktualisiert wird.
 */
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [{ url: "/~offline", revision: randomUUID() }]
});

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Ensure TS from workspaces is transpiled
  transpilePackages: ["@doewe/shared"],
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }
    return config;
  }
};

export default withSerwist(nextConfig);
