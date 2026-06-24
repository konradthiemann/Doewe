"use client";

import Link from "next/link";

import { useI18n } from "../lib/i18n";

export type LegalSection = {
  heading?: string;
  paragraphs: React.ReactNode[];
};

/**
 * Einheitliches Layout für Rechtstexte (Impressum, Datenschutzerklärung).
 * Erwartet bereits lokalisierte Inhalte — die Seite wählt die Sprache anhand
 * von `useI18n().locale` aus und übergibt die passenden Sections.
 */
export default function LegalContent({
  title,
  updated,
  sections
}: {
  title: string;
  updated?: string;
  sections: LegalSection[];
}) {
  const { t } = useI18n();

  return (
    <main id="maincontent" className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-neutral-100">
        {title}
      </h1>
      {updated && (
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">{updated}</p>
      )}

      <div className="mt-8 space-y-8">
        {sections.map((section, i) => (
          <section key={section.heading ?? `section-${i}`} className="space-y-3">
            {section.heading && (
              <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">
                {section.heading}
              </h2>
            )}
            {section.paragraphs.map((paragraph, j) => (
              <div
                key={`${section.heading ?? i}-${j}`}
                className="text-sm leading-relaxed text-gray-700 dark:text-neutral-300"
              >
                {paragraph}
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="mt-12 border-t border-gray-200 pt-6 dark:border-neutral-800">
        <Link
          href="/"
          className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← {t("legal.backHome")}
        </Link>
      </div>
    </main>
  );
}
