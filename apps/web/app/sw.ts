import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist } from "serwist";

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

/**
 * Service Worker (PWA Phase 1):
 * - Precached Build-Assets und die Offline-Fallback-Seite (/~offline)
 * - Navigationen ohne Netz fallen auf /~offline zurück
 * - /api/** wird bewusst NIE im Service Worker gecached — Daten-Offline kommt
 *   in Phase 2 in die App-Schicht (Query-Cache in IndexedDB), nicht in den SW.
 *   Das verhindert Stale-Daten-Bugs und authentifizierte JSONs im Cache Storage.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Muss VOR defaultCache stehen: erste passende Regel gewinnt.
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly()
    },
    ...defaultCache
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        }
      }
    ]
  }
});

serwist.addEventListeners();
