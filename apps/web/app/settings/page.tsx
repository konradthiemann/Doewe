"use client";

import { useSession } from "next-auth/react";

import ChangePasswordCard from "../../components/ChangePasswordCard";
import HouseholdCard from "../../components/HouseholdCard";
import InstallAppCard from "../../components/InstallAppCard";
import NotificationsCard from "../../components/NotificationsCard";
import PageContainer from "../../components/PageContainer";
import { useI18n, type Locale } from "../../lib/i18n";
import { useTheme, type Theme } from "../../lib/ThemeContext";

export default function SettingsPage() {
  const { data } = useSession();
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();

  // Sprachwahl liegt client-seitig; für server-gerenderte Push-Texte (Teil C)
  // wird sie zusätzlich ins User-Feld synchronisiert.
  function handleLocaleChange(next: Locale) {
    setLocale(next);
    void fetch("/api/me/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next })
    }).catch(() => undefined);
  }

  return (
    <main id="maincontent" className="py-6 md:py-8">
      <PageContainer className="max-w-4xl space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-card border border-line bg-surface/95 p-4 shadow-card">
        <h2 className="text-lg font-medium">{t("settings.accountTitle")}</h2>
        <p className="text-sm text-ink-muted">
          {t("settings.signedInAs", { email: data?.user?.email ?? t("settings.unknown") })}
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface/95 p-4 shadow-card">
        <h2 className="text-lg font-medium">{t("settings.languageTitle")}</h2>
        <p className="text-sm text-ink-muted">{t("settings.languageDescription")}</p>
        <div className="mt-3">
          <label htmlFor="settings-language" className="sr-only">
            {t("settings.languageTitle")}
          </label>
          <select
            id="settings-language"
            value={locale}
            onChange={(event) => handleLocaleChange(event.target.value === "en" ? "en" : "de")}
            className="w-full max-w-xs rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-brand focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <option value="de">{t("settings.languageOptionDe")}</option>
            <option value="en">{t("settings.languageOptionEn")}</option>
          </select>
        </div>
      </div>
      </div>

      {/* Household Section (Teil D) */}
      <HouseholdCard />

      {/* Change Password Section */}
      <ChangePasswordCard />

      {/* Notifications Section */}
      <NotificationsCard />

      {/* Theme Section */}
      <div className="rounded-card border border-line bg-surface/95 p-4 shadow-card">
        <h2 className="text-lg font-medium">{t("settings.themeTitle")}</h2>
        <p className="text-sm text-ink-muted">{t("settings.themeDescription")}</p>
        <fieldset className="mt-3">
          <legend className="sr-only">{t("settings.themeTitle")}</legend>
          <div className="flex flex-wrap gap-3">
            {(["light", "dark", "system"] as Theme[]).map((option) => (
              <label
                key={option}
                className={`relative flex cursor-pointer items-center gap-2 rounded-field border px-4 py-2.5 shadow-card transition-all ${
                  theme === option
                    ? "border-brand bg-brand-soft ring-2 ring-brand"
                    : "border-line-strong bg-surface hover:border-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={option}
                  checked={theme === option}
                  onChange={(e) => setTheme(e.target.value as Theme)}
                  className="sr-only"
                />
                <span className="text-lg" aria-hidden="true">
                  {option === "light" ? "☀️" : option === "dark" ? "🌙" : "💻"}
                </span>
                <span className={`text-sm font-medium ${theme === option ? "text-brand" : "text-ink"}`}>
                  {t(`settings.theme${option.charAt(0).toUpperCase() + option.slice(1)}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Install as App Section — nur sichtbar, wenn die App nicht installiert ist */}
      <InstallAppCard />
      </PageContainer>
    </main>
  );
}
