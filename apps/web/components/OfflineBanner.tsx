"use client";

import { useSyncExternalStore } from "react";

import { useI18n } from "../lib/i18n";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Schmale Statusleiste, sobald die Verbindung fehlt.
 * Die Seiten zeigen dann den letzten Stand aus dem persistierten Query-Cache.
 * z-[70]: über Sidebar/Bottom-Nav (z-40/z-50) und Drawer-Overlay (z-[60]).
 */
export default function OfflineBanner() {
  const { t } = useI18n();
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-modal bg-warning px-4 py-1.5 text-center text-xs font-medium text-brand-on"
    >
      {t("offline.banner")}
    </div>
  );
}
