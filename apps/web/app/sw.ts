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

/**
 * Web Push (Teil C): Der Server sendet ein JSON-Payload
 * { title, body, url?, tag? }. Der SW zeigt die Notification an; ein Klick
 * fokussiert ein offenes Fenster (und navigiert dorthin) oder öffnet ein neues.
 */
type PushPayload = { title?: string; body?: string; url?: string; tag?: string };

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "Doewe", body: event.data.text() };
  }
  const title = payload.title ?? "Doewe";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url ?? "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  const targetUrl = data?.url ?? "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.navigate(targetUrl).catch(() => undefined);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })()
  );
});
