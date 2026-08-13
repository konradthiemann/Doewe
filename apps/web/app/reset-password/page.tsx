"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import LegalFooter from "../../components/LegalFooter";
import { Spinner } from "../../components/ui/Spinner";
import { useI18n } from "../../lib/i18n";

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Precheck the link so we can show an "invalid/expired" state immediately.
  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data: { valid?: boolean } = await res.json().catch(() => ({}));
        if (active) setTokenState(data.valid ? "valid" : "invalid");
      } catch {
        if (active) setTokenState("invalid");
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("resetPassword.errorTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPassword.errorMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          setError(t("auth.rateLimited"));
          return;
        }
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(
          data.error === "INVALID_OR_EXPIRED_TOKEN"
            ? t("resetPassword.errorInvalidToken")
            : t("resetPassword.errorFailed")
        );
        if (data.error === "INVALID_OR_EXPIRED_TOKEN") setTokenState("invalid");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError(t("resetPassword.errorFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface/95 p-6 shadow-raised backdrop-blur">
      {tokenState === "checking" && (
        <p role="status" className="text-sm text-ink-muted">
          {t("resetPassword.checking")}
        </p>
      )}

      {tokenState === "invalid" && !done && (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-danger">
            {t("resetPassword.errorInvalidToken")}
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex w-full items-center justify-center rounded-field bg-brand px-4 py-2 text-sm font-semibold text-brand-on shadow-card transition hover:bg-brand-hover focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {t("resetPassword.requestNew")}
          </Link>
        </div>
      )}

      {/* Persistent live region so the success confirmation is announced. */}
      <div role="status" aria-live="polite">
        {done && (
          <p className="text-sm text-success">
            {t("resetPassword.success")}
          </p>
        )}
      </div>

      {tokenState === "valid" && !done && (
        <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? "reset-error" : undefined}>
          <p className="text-sm text-ink-muted">{t("resetPassword.description")}</p>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="new-password">
              {t("resetPassword.newPasswordLabel")} <span className="text-danger">*</span>
            </label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-ink-muted">{t("resetPassword.passwordHint")}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="confirm-password">
              {t("resetPassword.confirmLabel")} <span className="text-danger">*</span>
            </label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-field bg-brand px-4 py-2 text-sm font-semibold text-brand-on shadow-card transition hover:bg-brand-hover disabled:opacity-50 focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {loading && <Spinner size="sm" className="mr-2" />}
            {loading ? t("resetPassword.submitting") : t("resetPassword.submit")}
          </button>

          {error && (
            <p id="reset-error" role="alert" className="text-sm text-danger">
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
  );
}

export default function ResetPasswordPage() {
  const { t } = useI18n();
  return (
    <main id="maincontent" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Doewe</h1>
        <p className="text-sm text-ink-muted">{t("resetPassword.title")}</p>
      </div>

      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>

      <LegalFooter className="mt-8" />
    </main>
  );
}
