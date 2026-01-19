"use client";

import { signOut, useSession } from "next-auth/react";

import { useI18n } from "../../lib/i18n";

export default function SettingsPage() {
  const { data } = useSession();
  const { locale, setLocale, t } = useI18n();

  return (
    <main id="maincontent" className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
        <p className="text-sm text-gray-600 dark:text-neutral-300">{t("settings.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95">
        <h2 className="text-lg font-medium">{t("settings.accountTitle")}</h2>
        <p className="text-sm text-gray-600 dark:text-neutral-300">
          {t("settings.signedInAs", { email: data?.user?.email ?? t("settings.unknown") })}
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 focus:outline-none focus-visible:ring focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          {t("auth.signOut")}
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95">
        <h2 className="text-lg font-medium">{t("settings.languageTitle")}</h2>
        <p className="text-sm text-gray-600 dark:text-neutral-300">{t("settings.languageDescription")}</p>
        <div className="mt-3">
          <label htmlFor="settings-language" className="sr-only">
            {t("settings.languageTitle")}
          </label>
          <select
            id="settings-language"
            value={locale}
            onChange={(event) => setLocale(event.target.value === "en" ? "en" : "de")}
            className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="de">{t("settings.languageOptionDe")}</option>
            <option value="en">{t("settings.languageOptionEn")}</option>
          </select>
        </div>
      </div>
    </main>
  );
}
