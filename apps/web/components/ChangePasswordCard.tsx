"use client";

import { useState } from "react";

import { useI18n } from "../lib/i18n";

import { Button } from "./ui/Button";

const MIN_PASSWORD_LENGTH = 8;

const inputClass =
  "w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-brand focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2";

export default function ChangePasswordCard() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(t("settings.password.errorTooShort"));
      return;
    }
    if (next !== confirm) {
      setError(t("settings.password.errorMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          setError(t("auth.rateLimited"));
          return;
        }
        const data: { error?: unknown } = await res.json().catch(() => ({}));
        if (data.error === "INVALID_CURRENT_PASSWORD") {
          setError(t("settings.password.errorCurrentWrong"));
        } else if (data.error === "SAME_PASSWORD") {
          setError(t("settings.password.errorSame"));
        } else {
          setError(t("settings.password.errorFailed"));
        }
        return;
      }
      setMessage(t("settings.password.success"));
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError(t("settings.password.errorFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface/95 p-4 shadow-card">
      <h2 className="text-lg font-medium">{t("settings.password.title")}</h2>
      <p className="text-sm text-ink-muted">{t("settings.password.description")}</p>

      <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:max-w-sm" aria-describedby={error ? "change-pw-error" : undefined}>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="current-password">
            {t("settings.password.currentLabel")}
          </label>
          <input
            id="current-password"
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="new-password">
            {t("settings.password.newLabel")}
          </label>
          <input
            id="new-password"
            type="password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-ink-muted">{t("settings.password.hint")}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="confirm-new-password">
            {t("settings.password.confirmLabel")}
          </label>
          <input
            id="confirm-new-password"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </div>

        <div>
          <Button type="submit" loading={loading}>
            {loading ? t("settings.password.submitting") : t("settings.password.submit")}
          </Button>
        </div>

        {/* Persistent live regions so screen readers announce status changes. */}
        <div role="alert" aria-live="assertive">
          {error && (
            <p id="change-pw-error" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div role="status" aria-live="polite">
          {message && (
            <p className="text-sm text-success">
              {message}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
