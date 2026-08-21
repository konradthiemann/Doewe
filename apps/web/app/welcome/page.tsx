import Link from "next/link";

import { BrandLockup, BrandMark } from "../../components/Brand";
import LegalFooter from "../../components/LegalFooter";

const iconClass = "h-6 w-6 shrink-0";

const features: Array<{ title: string; description: string; icon: JSX.Element }> = [
  {
    title: "Transaktionen & Kategorien",
    description:
      "Einnahmen und Ausgaben im Blick, wiederkehrende Buchungen laufen automatisch mit.",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 6h14" />
        <path d="M5 12h10" />
        <path d="M5 18h8" />
      </svg>
    )
  },
  {
    title: "Kassenbeleg-Scanner",
    description:
      "Beleg fotografieren, KI erkennt Positionen und Preise automatisch — Buchen in Sekunden statt Abtippen.",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    )
  },
  {
    title: "Sparpläne",
    description: "Sparziele festlegen und Fortschritt Monat für Monat verfolgen.",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 4h14v4H5z" />
        <path d="M5 8h14v12H5z" />
        <path d="M9 12h6" />
        <path d="M9 16h3" />
      </svg>
    )
  },
  {
    title: "Steuer-Export als PDF",
    description:
      "Alle steuerrelevanten Buchungen eines Jahres inklusive Belege als ein übergabefähiges PDF exportieren.",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 14.25l6-6" />
        <path d="M19.5 4.757v16.993l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" />
      </svg>
    )
  }
];

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <BrandLockup markClassName="h-7 w-7" />
        <Link
          href="/login"
          className="rounded-field border border-line-strong px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Anmelden
        </Link>
      </header>

      <main id="maincontent">
        <section className="relative mx-auto max-w-3xl px-6 pb-16 pt-12 text-center sm:pt-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center"
          >
            <div className="h-72 w-72 rounded-full bg-brand-soft blur-3xl" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Eure Finanzen.
            <br />
            Gemeinsam im Blick.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink-muted">
            Doewe ist die Finanz-App für Haushalte — Transaktionen, Budgets und Sparpläne an
            einem Ort, mit KI-gestütztem Kassenbeleg-Scanner statt manueller Eingabe.
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
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-20">
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-card border border-line bg-surface p-6 shadow-card"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-field bg-brand-soft text-brand">
                  {feature.icon}
                </div>
                <h2 className="mt-4 text-base font-semibold text-ink">{feature.title}</h2>
                <p className="mt-1.5 text-sm text-ink-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line bg-surface-2">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-16 text-center">
            <BrandMark className="h-9 w-9 text-brand" />
            <h2 className="text-2xl font-bold tracking-tight">Für Haushalte gemacht</h2>
            <p className="max-w-lg text-ink-muted">
              Lade dein Zuhause ein und führt eure Finanzen gemeinsam — jede Buchung ist für
              alle sichtbar, jede Kategorie geteilt.
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
