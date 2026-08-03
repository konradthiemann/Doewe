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
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("forgotPassword.title")}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white/95 p-6 shadow-md backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
        {/* Persistent live region so screen readers announce the confirmation
            (a region mounted together with its text may not be announced). */}
        <div role="status" aria-live="polite">
          {submitted && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {t("forgotPassword.success")}
            </p>
          )}
        </div>

        {!submitted && (
          <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? "forgot-error" : undefined}>
            <p className="text-sm text-gray-600 dark:text-neutral-300">{t("forgotPassword.description")}</p>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                {t("forgotPassword.emailLabel")} <span className="text-red-600">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {loading && <Spinner size="sm" className="mr-2" />}
              {loading ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
            </button>

            {error && (
              <p id="forgot-error" role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {t("forgotPassword.backToLogin")}
          </Link>
        </p>
      </div>

      <LegalFooter className="mt-8" />
    </main>
  );
}
