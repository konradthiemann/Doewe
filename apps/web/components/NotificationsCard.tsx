"use client";

import { useCallback, useEffect, useState } from "react";

import { useI18n } from "../lib/i18n";
import {
  isPushSubscribed,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  vapidConfigured
} from "../lib/pushClient";

import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

/**
 * Settings-Karte „Mitteilungen" (Teil C): aktiviert Web Push auf diesem Gerät
 * (Permission-Geste), schaltet die einzelnen Push-Familien und konfiguriert den
 * Erfassungs-Reminder. iOS-Weiche: Push braucht die installierte PWA.
 */

type ReminderState = {
  enabled: boolean;
  time: string;
  weekdays: number;
  timezone: string;
  smartSuppress: boolean;
};

type SettingsState = {
  notifyBudgetAlerts: boolean;
  notifyMonthlyReview: boolean;
  reminder: ReminderState;
};

// UI-Reihenfolge Mo..So; Wert = Bit-Index (0 = So … 6 = Sa) in der Bitmaske.
const WEEKDAY_BITS: { key: string; bit: number }[] = [
  { key: "mon", bit: 1 },
  { key: "tue", bit: 2 },
  { key: "wed", bit: 3 },
  { key: "thu", bit: 4 },
  { key: "fri", bit: 5 },
  { key: "sat", bit: 6 },
  { key: "sun", bit: 0 }
];

export default function NotificationsCard() {
  const { t } = useI18n();
  const toast = useToast();

  const [mounted, setMounted] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<SettingsState | null>(null);

  useEffect(() => {
    setMounted(true);
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
    setIos(/iPad|iPhone|iPod/.test(window.navigator.userAgent));
    void isPushSubscribed().then(setSubscribed);
    void fetch("/api/notifications/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SettingsState | null) => data && setSettings(data))
      .catch(() => undefined);
  }, []);

  const persist = useCallback(
    async (patch: Partial<Pick<SettingsState, "notifyBudgetAlerts" | "notifyMonthlyReview">> & { reminder?: Partial<ReminderState> }) => {
      await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      }).catch(() => undefined);
    },
    []
  );

  async function handleEnable() {
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await subscribeToPush();
      if (result === "subscribed") {
        setSubscribed(true);
        // Zeitzone gleich mitspeichern, damit Reminder in lokaler Zeit feuern.
        await persist({ reminder: { timezone: tz } });
        setSettings((s) => (s ? { ...s, reminder: { ...s.reminder, timezone: tz } } : s));
        toast.success(t("notifications.enabled"));
      } else if (result === "denied") {
        toast.error(t("notifications.denied"));
      } else {
        toast.error(t("notifications.unsupported"));
      }
    } catch {
      toast.error(t("notifications.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      toast.success(t("notifications.disabled"));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data: { sent?: number } = await res.json().catch(() => ({}));
      if (data.sent && data.sent > 0) toast.success(t("notifications.testSent"));
      else toast.error(t("notifications.testNone"));
    } finally {
      setBusy(false);
    }
  }

  function updateFlag(key: "notifyBudgetAlerts" | "notifyMonthlyReview", value: boolean) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    void persist({ [key]: value });
  }

  function updateReminder(patch: Partial<ReminderState>) {
    setSettings((s) => (s ? { ...s, reminder: { ...s.reminder, ...patch } } : s));
    void persist({ reminder: patch });
  }

  function toggleWeekday(bit: number) {
    if (!settings) return;
    const next = settings.reminder.weekdays ^ (1 << bit);
    updateReminder({ weekdays: next });
  }

  const cardClass =
    "rounded-card border border-line bg-surface/95 p-4 shadow-card";

  if (!mounted) return null;

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium">{t("notifications.title")}</h2>
      <p className="text-sm text-ink-muted">{t("notifications.description")}</p>

      {!pushSupported() ? (
        <p className="mt-3 text-sm text-ink-muted">{t("notifications.unsupported")}</p>
      ) : ios && !standalone ? (
        <p className="mt-3 text-sm text-ink-muted">{t("notifications.iosInstallHint")}</p>
      ) : !vapidConfigured() ? (
        <p className="mt-3 text-sm text-ink-muted">{t("notifications.unconfigured")}</p>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {subscribed ? (
              <Button variant="secondary" onClick={handleDisable} loading={busy}>
                {t("notifications.disableButton")}
              </Button>
            ) : (
              <Button onClick={handleEnable} loading={busy}>
                {t("notifications.enableButton")}
              </Button>
            )}
            {subscribed && (
              <Button variant="secondary" onClick={handleTest} loading={busy}>
                {t("notifications.testButton")}
              </Button>
            )}
          </div>

          {subscribed && settings && (
            <div className="space-y-4 border-t border-line pt-4">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{t("notifications.budgetAlerts")}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
                  checked={settings.notifyBudgetAlerts}
                  onChange={(e) => updateFlag("notifyBudgetAlerts", e.target.checked)}
                />
              </label>

              <label className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{t("notifications.monthlyReview")}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
                  checked={settings.notifyMonthlyReview}
                  onChange={(e) => updateFlag("notifyMonthlyReview", e.target.checked)}
                />
              </label>

              <div className="border-t border-line pt-4">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    {t("notifications.reminderTitle")}
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
                    checked={settings.reminder.enabled}
                    onChange={(e) => updateReminder({ enabled: e.target.checked })}
                  />
                </label>
                <p className="mt-1 text-xs text-ink-muted">{t("notifications.reminderHint")}</p>

                {settings.reminder.enabled && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <label htmlFor="reminder-time" className="text-sm text-ink">
                        {t("notifications.reminderTime")}
                      </label>
                      <input
                        id="reminder-time"
                        type="time"
                        value={settings.reminder.time}
                        onChange={(e) => updateReminder({ time: e.target.value })}
                        className="rounded-field border border-line-strong bg-surface px-2 py-1 text-sm text-ink shadow-card focus:border-brand focus:outline-none"
                      />
                    </div>

                    <fieldset>
                      <legend className="text-sm text-ink">
                        {t("notifications.reminderWeekdays")}
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {WEEKDAY_BITS.map(({ key, bit }) => {
                          const active = (settings.reminder.weekdays & (1 << bit)) !== 0;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleWeekday(bit)}
                              aria-pressed={active}
                              className={`rounded-field border px-2.5 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? "border-brand bg-brand-soft text-brand"
                                  : "border-line-strong bg-surface text-ink-muted"
                              }`}
                            >
                              {t(`notifications.weekday.${key}`)}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink">
                        {t("notifications.smartSuppress")}
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
                        checked={settings.reminder.smartSuppress}
                        onChange={(e) => updateReminder({ smartSuppress: e.target.checked })}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
