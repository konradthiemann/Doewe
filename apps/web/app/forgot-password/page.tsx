"use client";

import Link from "next/link";
import { useState } from "react";

import LegalFooter from "../../components/LegalFooter";
import { Spinner } from "../../components/ui/Spinner";
import { useI18n } from "../../lib/i18n";

export default function ForgotPasswordPage() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      if (!res.ok) {
        setError(t(res.status === 429 ? "auth.rateLimited" : "forgotPassword.error"));
        return;
      }
      // Response is intentionally generic — show success regardless.
      setSubmitted(true);
    } catch {
      setError(t("forgotPassword.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="maincontent" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Doewe</h1>
        <p className="text-sm text-ink-muted">{t("forgotPassword.title")}</p>
      </div>

      <div className="rounded-card border border-line bg-surface/95 p-6 shadow-raised backdrop-blur">
        {/* Persistent live region so screen readers announce the confirmation
            (a region mounted together with its text may not be announced). */}
        <div role="status" aria-live="polite">
          {submitted && (
            <p className="text-sm text-success">
              {t("forgotPassword.success")}
            </p>
          )}
        </div>

        {!submitted && (
          <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? "forgot-error" : undefined}>
            <p className="text-sm text-ink-muted">{t("forgotPassword.description")}</p>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                {t("forgotPassword.emailLabel")} <span className="text-danger">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-field bg-brand px-4 py-2 text-sm font-semibold text-brand-on shadow-card transition hover:bg-brand-hover disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {loading && <Spinner size="sm" className="mr-2" />}
              {loading ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
            </button>

            {error && (
              <p id="forgot-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-brand hover:text-brand-hover focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {t("forgotPassword.backToLogin")}
          </Link>
        </p>
      </div>

      <LegalFooter className="mt-8" />
    </main>
  );
}
