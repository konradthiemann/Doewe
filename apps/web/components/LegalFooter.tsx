"use client";

import Link from "next/link";

import { useI18n } from "../lib/i18n";

/**
 * Schlanke Fußzeile mit den gesetzlich vorgeschriebenen Links auf
 * Impressum (§ 5 DDG) und Datenschutzerklärung (Art. 13 DSGVO).
 * Wird u. a. auf der öffentlichen Login-Seite eingebunden, damit die
 * Pflichtseiten ohne Anmeldung erreichbar sind.
 */
export default function LegalFooter({ className = "" }: { className?: string }) {
  const { t } = useI18n();

  return (
    <footer
      className={`flex items-center justify-center gap-3 text-xs text-ink-muted ${className}`}
    >
      <Link
        href="/impressum"
        className="transition hover:text-ink hover:underline"
      >
        {t("legal.impressum")}
      </Link>
      <span aria-hidden="true">·</span>
      <Link
        href="/datenschutz"
        className="transition hover:text-ink hover:underline"
      >
        {t("legal.privacy")}
      </Link>
    </footer>
  );
}
