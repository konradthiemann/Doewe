"use client";

import { signOut } from "next-auth/react";

import { useI18n } from "../lib/i18n";

export default function LogoutButton() {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
      aria-label={t("auth.signOut")}
    >
      <span aria-hidden="true">↩︎</span>
      {t("auth.signOut")}
    </button>
  );
}
