"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import LegalFooter from "../../../components/LegalFooter";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { useI18n } from "../../../lib/i18n";

/**
 * /haushalt/beitreten?token=… — Landeseite für Haushalts-Einladungs-Links
 * (Teil D). Der eingeloggte Nutzer nimmt die Einladung an; Gäste werden zum
 * Login geschickt und kehren via callbackUrl mit erhaltenem Token zurück.
 */
export default function JoinHouseholdPage() {
  const { t } = useI18n();
  const { status } = useSession();

  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("token");
    setToken(raw);
    if (!raw) setError(t("household.join.missingToken"));
  }, [t]);

  async function handleAccept() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/household/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (res.ok) {
        setDone(true);
        window.location.assign("/");
        return;
      }
      const data: { error?: unknown } = await res.json().catch(() => ({}));
      if (res.status === 429) setError(t("auth.rateLimited"));
      else if (data.error === "HAS_OWN_DATA") setError(t("household.join.hasOwnData"));
      else if (data.error === "Already a member of this household") setError(t("household.join.alreadyMember"));
      else setError(t("household.join.invalid"));
    } catch {
      setError(t("household.join.invalid"));
    } finally {
      setBusy(false);
    }
  }

  const loginHref = token
    ? `/login?callbackUrl=${encodeURIComponent(`/haushalt/beitreten?token=${token}`)}`
    : "/login";

  return (
    <main id="maincontent" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Doewe</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("household.join.title")}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white/95 p-6 shadow-md backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
        {status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-300">
            <Spinner size="sm" /> {t("household.join.loading")}
          </p>
        ) : done ? (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            {t("household.join.success")}
          </p>
        ) : !token ? (
          <p role="alert" className="text-sm text-red-600">
            {t("household.join.missingToken")}
          </p>
        ) : status === "unauthenticated" ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-neutral-200">{t("household.join.needLogin")}</p>
            <Link
              href={loginHref}
              className="flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              {t("household.join.loginButton")}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-neutral-200">{t("household.join.title")}</p>
            <Button onClick={handleAccept} loading={busy} className="w-full">
              {busy ? t("household.join.accepting") : t("household.join.accept")}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      <LegalFooter className="mt-8" />
    </main>
  );
}
