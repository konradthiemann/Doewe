"use client";

import { Button } from "../../components/ui/Button";
import { useI18n } from "../../lib/i18n";

/**
 * Offline-Fallback-Seite: wird vom Service Worker precached und bei
 * Navigationen ohne Netzverbindung ausgeliefert (siehe app/sw.ts fallbacks).
 * Die Route ist im Middleware-Matcher von der Auth ausgenommen, damit der
 * Precache-Fetch beim SW-Install nicht auf /login umgeleitet wird.
 */
export default function OfflinePage() {
  const { t } = useI18n();

  return (
    <main id="maincontent" className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-5xl" aria-hidden="true">
          📡
        </p>
        <h1 className="text-xl font-semibold text-ink">{t("offline.title")}</h1>
        <p className="text-sm text-ink-muted">{t("offline.body")}</p>
        <Button onClick={() => window.location.reload()}>{t("offline.retry")}</Button>
      </div>
    </main>
  );
}
