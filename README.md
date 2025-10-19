# Doewe – Familienmanagement

Ziel ist es, ein Familienmanagement‑System zu entwickeln, mit dem Finanzen schnell erfasst, Ziele gesetzt und potenzielle Ausgaben vorgemerkt werden können. Auf Basis der Daten sollen Muster erkannt und Verhalten analysiert werden, um Hindernisse bei der Zielerreichung sichtbar zu machen.

## Status
- Lernprojekt einer einzelnen Entwicklerperson
- Inkrementelle Entwicklung, Fokus auf Code‑Qualität

## MVP‑Umfang (erste Iteration)
- Konten und Kategorien verwalten
- Transaktionen erfassen (einmalig, wiederkehrend)
- Budgets und Ziele definieren
- Einfache Auswertungen/Insights

Nicht‑Ziele im MVP
- Keine Mobile‑App
- Kein Multi‑Tenancy
- Kein Produktionseinsatz

## Tech‑Stack
- App: Next.js 14 (App Router), React 18, TypeScript
- Monorepo: npm Workspaces (apps/*, packages/*)
- Node: 20.x empfohlen (CI nutzt 20; lokale Abweichungen können Dev‑Probleme verursachen)
- Lint/Typecheck/Tests: werden iterativ ergänzt

## Schnellstart
1) Installieren
   - `npm install`
2) Entwicklung starten
   - `npm run dev:web` (startet [apps/web](apps/web))
3) Öffnen
   - http://localhost:3000

## Nützliche Skripte
- Root
  - `dev:web` – Entwicklungsserver für die Web‑App
- App (siehe [apps/web/package.json](apps/web/package.json))
  - `dev`, `build`, `start`, `lint`, `typecheck`

## Repository‑Struktur
- apps/web – Next.js App (App Router)
- packages/shared – Platzhalter für gemeinsame Typen/Logik
- .github – Projekt‑Guidelines ([.github/github-instructions.md](.github/github-instructions.md))
- CHANGELOG.md – Änderungsprotokoll (Root)
- monorepoTimeline.md – Chronologische Entwickler‑Timeline (neueste zuerst)

## Qualitätsregeln (kurz)
- Starke Typisierung (strict)
- Linting/Typecheck/Tests verpflichtend vor Merges (wird ausgebaut)
- Keine Secrets im Repo, `.env.example` pflegen

## Sicherheit
- Environment‑Variablen nutzen, keine sensiblen Daten committen
- Eingaben validieren, unsichere Patterns vermeiden

## Nächste Schritte
- ESLint/TS‑Baselines zentralisieren
- Minimalen CI‑Workflow hinzufügen
- Domain‑Modelle und erste Use‑Cases skizzieren