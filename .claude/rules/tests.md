---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "apps/web/tests/**"
  - "packages/shared/src/**/*.test.ts"
---
# Tests — Vitest

## Zwei Test-Typen
- **Domain-Tests** (`packages/shared/src/*.test.ts`): reine Funktions-Tests, kein HTTP, kein Prisma
- **API-Tests** (`apps/web/tests/*.test.ts`): Integrationstests für Route Handlers

## Globale Konfiguration
`vitest.config.ts` im Root — include-Patterns:
- `packages/*/src/**/*.{test,spec}.{ts,tsx}`
- `apps/*/tests/**/*.{test,spec}.{ts,tsx}`

## Wichtig
- `pretest` in `apps/web` pusht Schema + seed — lokale DB muss erreichbar sein für API-Tests
- Kein Jest — nur Vitest; keine `describe`/`it`-Imports aus jest importieren
- Tests mit `npm run test` von Root ausführen
