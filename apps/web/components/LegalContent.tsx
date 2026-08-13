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
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {title}
      </h1>
      {updated && (
        <p className="mt-1 text-xs text-ink-muted">{updated}</p>
      )}

      <div className="mt-8 space-y-8">
        {sections.map((section, i) => (
          <section key={section.heading ?? `section-${i}`} className="space-y-3">
            {section.heading && (
              <h2 className="text-base font-semibold text-ink">
                {section.heading}
              </h2>
            )}
            {section.paragraphs.map((paragraph, j) => (
              <div
                key={`${section.heading ?? i}-${j}`}
                className="text-sm leading-relaxed text-ink"
              >
                {paragraph}
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="mt-12 border-t border-line pt-6">
        <Link
          href="/"
          className="text-sm font-medium text-brand hover:underline"
        >
          ← {t("legal.backHome")}
        </Link>
      </div>
    </main>
  );
}
