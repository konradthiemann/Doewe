import Link from "next/link";


import { BrandLockup, BrandMark } from "../../components/Brand";
import LegalFooter from "../../components/LegalFooter";

import type { ReactNode } from "react";

const iconClass = "h-5 w-5 shrink-0";

function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-raised">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-income/60" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full" />
    </div>
  );
}

function PhoneFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[2.25rem] border-[6px] border-ink bg-ink shadow-raised">
      <div className="relative overflow-hidden rounded-[1.75rem]">
        <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-xl bg-ink" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block max-h-[560px] w-full object-cover object-top" />
      </div>
    </div>
  );
}

function PainPoint({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
    </div>
  );
}

function FeatureRow({
  eyebrow,
  title,
  description,
  points,
  visual,
  reverse
}: {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={`grid items-center gap-10 md:grid-cols-2 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mt-3 text-ink-muted">{description}</p>
        <ul className="mt-5 space-y-2.5">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm text-ink">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className={`${iconClass} mt-0.5 text-brand`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 13 4 4L19 7" />
              </svg>
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div>{visual}</div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLockup markClassName="h-7 w-7" />
        <Link
          href="/login"
          className="rounded-field border border-line-strong px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Anmelden
        </Link>
      </header>

      <main id="maincontent">
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-8 sm:pt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center"
          >
            <div className="h-72 w-72 rounded-full bg-brand-soft blur-3xl" />
          </div>

          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Eure Finanzen.
              <br />
              Gemeinsam im Blick.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-ink-muted">
              Doewe ist die Finanz-App für Haushalte, die es ernst meinen: Transaktionen, Budgets
              und Sparziele an einem Ort — mit einem Kassenbeleg-Scanner, der Belege per KI
              ausliest, statt dich tippen zu lassen.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="w-full rounded-field bg-brand px-6 py-3 text-sm font-semibold text-brand-on shadow-card transition hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:w-auto"
              >
                Kostenlos starten
              </Link>
              <Link
                href="/login"
                className="w-full rounded-field border border-line-strong px-6 py-3 text-sm font-semibold text-ink transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:w-auto"
              >
                Demo ansehen
              </Link>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Demo-Modus mit 3 Jahren Beispieldaten — ganz ohne eigene Anmeldung.
            </p>
          </div>

          <div className="mx-auto mt-14 max-w-4xl">
            <BrowserFrame src="/marketing/dashboard-desktop.png" alt="Doewe Übersicht mit Budget, Kategorien und Ausgabenverteilung" />
          </div>
        </section>

        {/* Problem framing */}
        <section className="border-y border-line bg-surface-2">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Kennst du das?
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <PainPoint
                title="„Wer hat das nochmal bezahlt?“"
                description="Geteilte Ausgaben landen in drei verschiedenen Apps, einem Zettel und dem Gedächtnis — und stimmen nie ganz."
              />
              <PainPoint
                title="Der Kassenzettel-Berg vor der Steuer"
                description="Belege sammeln, sortieren, abtippen — jedes Jahr wieder, meistens auf den letzten Drücker."
              />
              <PainPoint
                title="Sparziele, die im Kopf bleiben"
                description="„Wir sparen für den Urlaub“ — ohne Zahl, ohne Fortschritt, ohne dass sich je etwas ändert."
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl space-y-24 px-6 py-24">
          <FeatureRow
            eyebrow="Kassenbeleg-Scanner"
            title="Beleg fotografieren. Fertig."
            description="Ein Foto genügt: Die KI liest Händler, Positionen und Preise aus und schlägt passende Kategorien vor. Ein Einkauf mit Lebensmitteln und einem Geschenk wird automatisch in zwei Buchungen aufgeteilt — du prüfst nur noch kurz und bestätigst."
            points={[
              "Erkennt deutsche Kassenbons (ALDI, REWE, Lidl, dm, …)",
              "Teilt einen Beleg automatisch nach Kategorie auf",
              "Beleg bleibt als Foto an der Buchung — griffbereit für die Steuer"
            ]}
            visual={<PhoneFrame src="/marketing/new-transaction-mobile.png" alt="Transaktion hinzufügen mit Kassenbeleg-Scanner-Einstieg" />}
          />

          <FeatureRow
            eyebrow="Transaktionen & Budgets"
            title="Alles an einem Ort, für alle sichtbar"
            description="Jede Buchung, jede Kategorie, jedes Budget — für den ganzen Haushalt gleich sichtbar. Wiederkehrende Ausgaben laufen automatisch mit, Kategorie-Budgets zeigen sofort, wo es eng wird."
            points={[
              "Wiederkehrende Buchungen laufen automatisch mit",
              "Kategorie-Budgets: Ist vs. geplant auf einen Blick",
              "Ein Haushalt, eine Wahrheit — keine getrennten Tabellen mehr"
            ]}
            visual={<PhoneFrame src="/marketing/transactions-mobile.png" alt="Transaktionsliste mit wiederkehrenden Buchungen und Übersicht" />}
            reverse
          />

          <FeatureRow
            eyebrow="Sparpläne"
            title="Sparziele, die tatsächlich real werden"
            description="Statt „wir sparen mal für X“: ein konkretes Ziel, ein Datum, ein automatisch berechneter Monatsbetrag. Die Timeline zeigt, was als Nächstes ansteht und wie weit ihr seid."
            points={[
              "Automatische Berechnung des nötigen Sparbetrags pro Monat",
              "Timeline aller Ziele, sortiert nach Fälligkeit",
              "Fortschritt live sichtbar, nicht nur im Kopf"
            ]}
            visual={<BrowserFrame src="/marketing/saving-plan-desktop.png" alt="Sparplan mit Zielen, Fortschrittsbalken und Timeline" />}
          />

          <FeatureRow
            eyebrow="Steuer-Export"
            title="Steuererklärung ohne Schuhkarton"
            description="Als steuerrelevant markierte Buchungen sammeln sich automatisch. Am Jahresende: ein Klick, ein PDF — Tabelle mit Kategorie-Summen plus jeder einzelne Beleg als Anhang."
            points={[
              "Ein PDF pro Steuerjahr, inklusive aller Belege",
              "Nach Kategorie gruppiert mit Zwischensummen",
              "Fertig für Steuerberater:in oder Finanzamt"
            ]}
            visual={<PhoneFrame src="/marketing/tax-mobile.png" alt="Steuervorbereitung mit PDF-Export-Button" />}
            reverse
          />
        </section>

        {/* Vision / household */}
        <section className="border-t border-line bg-surface-2">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-20 text-center">
            <BrandMark className="h-9 w-9 text-brand" />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Für Haushalte gemacht, nicht für Einzelkämpfer
            </h2>
            <p className="max-w-lg text-ink-muted">
              Die meisten Finanz-Apps sind für eine Person gebaut — und werden zur Tabelle, die
              nur eine:r im Haushalt pflegt. Doewe ist von Anfang an für zwei oder mehr gedacht:
              Lade dein Zuhause ein, und jede Buchung, jede Kategorie, jedes Ziel ist für alle
              gleich sichtbar. Keine Excel-Weitergabe, kein „ich schick&apos;s dir per WhatsApp“.
            </p>
            <Link
              href="/login"
              className="mt-2 rounded-field bg-brand px-6 py-3 text-sm font-semibold text-brand-on shadow-card transition hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Jetzt loslegen
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 py-10">
        <LegalFooter />
      </footer>
    </div>
  );
}
