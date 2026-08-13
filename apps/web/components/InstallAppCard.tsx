"use client";

import { useEffect, useState } from "react";

import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";

/**
 * Settings-Karte „Als App installieren".
 * - Android/Chrome: fängt `beforeinstallprompt` ab und bietet einen echten Install-Button.
 * - iOS Safari: kennt das Event nicht — zeigt stattdessen die Teilen-Menü-Anleitung.
 * - Bereits installiert (standalone): Karte wird gar nicht gerendert.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallAppCard() {
  const { t } = useI18n();
  // Bis zum Mount nichts rendern (Standalone-Status ist nur im Browser bekannt).
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    setIos(/iPad|iPhone|iPod/.test(window.navigator.userAgent));

    const onBeforeInstallPrompt = (event: Event) => {
      // Default-Miniinfobar unterdrücken und Event für unseren Button aufheben
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setStandalone(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null;

  async function handleInstall() {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } finally {
      setInstallEvent(null);
      setInstalling(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface/95 p-4 shadow-card">
      <h2 className="text-lg font-medium">{t("settings.installTitle")}</h2>
      <p className="text-sm text-ink-muted">{t("settings.installDescription")}</p>
      <div className="mt-3">
        {installEvent ? (
          <Button onClick={handleInstall} loading={installing}>
            {t("settings.installButton")}
          </Button>
        ) : (
          <p className="text-sm text-ink-muted">
            {ios ? t("settings.installIosHint") : t("settings.installGenericHint")}
          </p>
        )}
      </div>
    </div>
  );
}
