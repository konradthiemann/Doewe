---
paths:
  - "packages/shared/**"
---
# @doewe/shared — Cross-Package Impact

Änderungen hier betreffen `apps/web` direkt (transpiled via `transpilePackages: ["@doewe/shared"]` in `next.config.mjs`).

## Vor Änderungen
- Public API aus `packages/shared/src/index.ts` lesen
- Prüfen ob `apps/web` die geänderte Funktion/den geänderten Typ direkt nutzt
- Bei Breaking Changes: alle Import-Stellen in `apps/web` mitanpassen

## Konventionen
- Alle Exports über `src/index.ts` bündeln
- Domain-Primitives (Money-Arithmetik, String-Utils) hier — keine HTTP/Prisma-Abhängigkeiten
- Tests direkt neben den Quelldateien: `money.test.ts`, `strings.test.ts`, `domain.test.ts`
- TypeScript strict — keine `any`-Typen
