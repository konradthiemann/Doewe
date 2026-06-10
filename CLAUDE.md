# Doewe Monorepo

## Zweck
Personal finance tracking platform — Transaktionen, Budgets, Sparpläne, wiederkehrende Buchungen und Analytics. Next.js App Router auf Railway (PostgreSQL), lokal mit Docker Postgres.

## Befehle (Root)
```bash
npm run dev:web                # Next.js dev server
npm run dev:web:local          # Docker Postgres starten + seed + dev
npm run lint                   # ESLint alle Workspaces
npm run typecheck              # TypeScript alle Workspaces (noEmit)
npm run test                   # Vitest alle Workspaces
npm run build                  # Build alle Workspaces
```

## Befehle (Workspace)
```bash
npm --workspace @doewe/web run db:push               # Prisma schema push
npm --workspace @doewe/web run db:seed               # Seed-Daten
npm --workspace @doewe/web run prisma:generate       # Client nach Schema-Änderung
npm --workspace @doewe/web run prisma:migrate:deploy # Prod-Migration
```

## Verzeichnisstruktur
```
apps/web/
  app/api/          # Next.js Route Handlers (je Ressource eine route.ts)
  app/api/auth/     # NextAuth Endpoints ([...nextauth])
  components/       # React-Komponenten (Tailwind)
  lib/              # prisma.ts (Singleton), auth.ts (getSessionUser)
  prisma/           # Schema, Migrations, seed.js
  tests/            # API-Integrationstests (Vitest)
packages/shared/
  src/              # money.ts, strings.ts, domain.ts + *.test.ts
shared/
  eslint/           # eslint.base.cjs — Baseline für alle Workspaces
  tsconfig/         # tsconfig.base.json
vitest.config.ts    # Globale Vitest-Konfiguration
```

## Tech Stack
- **Framework:** Next.js 14.2.5 — App Router, Server Components by default
- **Auth:** next-auth v4 + @next-auth/prisma-adapter, Session über `getSessionUser()` in `lib/auth.ts`
- **ORM:** Prisma 5.19.x + PostgreSQL (prod: Railway, lokal: Docker)
- **Styling:** Tailwind CSS 3.4.x + @tailwindcss/forms (kein inline-style)
- **Validation:** Zod in API Routes
- **Charts:** chart.js + react-chartjs-2 + chartjs-plugin-datalabels
- **Shared:** `@doewe/shared` — Money-Arithmetik, String-Utils, Domain-Typen

## Tests
- **Runner:** Vitest (globale Config `vitest.config.ts`)
- Domain-Tests: `packages/shared/src/*.test.ts`
- API-Tests: `apps/web/tests/*.test.ts` (testen Route Handlers direkt)
- `npm run test` — läuft alles; `pretest` in apps/web pusht Schema + seed

## Coding-Konventionen
- TypeScript strict everywhere; Domain-Logik in `@doewe/shared`, nicht in `apps/web`
- API Route Handlers: export HTTP-Verb-Funktionen (GET, POST, PUT, DELETE) aus `route.ts`
- Auth-Guard am Anfang jeder Route: `const user = await getSessionUser(); if (!user) return 401`
- `'use client'` nur wenn nötig; Server Components by default
- ESLint-Baseline: `shared/eslint/eslint.base.cjs`, extended per Workspace

## Prisma
- Singleton-Pattern: `apps/web/lib/prisma.ts`
- Schema + Migrations: `apps/web/prisma/`
- Nach Schema-Änderung immer `prisma:generate` laufen lassen
- Prod-Migration troubleshooting: siehe README.md Abschnitt "Migration troubleshooting"

## Agents
Spezialisierte Sub-Agents in `.claude/agents/` — Übersicht in README.md Abschnitt "Claude AI Agents".
Einstiegspunkt für Multi-Layer-Features: `@orchestrator`

## Analyse-Qualität: Fakten vs. Annahmen
Vor jeder Empfehlung gilt:
1. Alle betroffenen Dateien tatsächlich lesen
2. Aussagen kategorisieren:
   - Belegt — direkt aus gelesenem Code ableitbar
   - Vermutung — plausibel, aber nicht durch Code bewiesen
   - Unbekannt — benötigt Laufzeit-Analyse
3. Korrekturen offen kommunizieren

Details zu Konventionen: `.claude/rules/`
