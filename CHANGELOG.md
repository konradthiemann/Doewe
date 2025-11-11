## [0.0.16] - 2025-11-11
### Added
- Budgets page `/budgets` with Tailwind-styled form and list.
- API routes for Budgets and Recurring Transactions using Prisma + Zod.
- Transactions form now includes Account and Category selects.
### Changed
- Prisma schema extended for `Budget` and `RecurringTransaction` (frequency as string for SQLite).
### Why
- Cover core planning features (budgets) and recurring expenses; improve UX with selects.
### How
- Added page at `apps/web/app/budgets/page.tsx`.
- API handlers at `apps/web/app/api/budgets/route.ts` and `apps/web/app/api/recurring-transactions/route.ts`.
- Schema updates under `apps/web/prisma/schema.prisma`.

## [0.0.15] - 2025-10-19
### Added
- Tailwind CSS setup (config, PostCSS, plugin forms) in `apps/web`.
- Accessibility enhancements (skip link, semantic landmarks).
### Changed
- Transactions page refactored to Tailwind (removed inline styles).
- README trimmed to expert-standard overview (moved detailed scope to requirements doc).
### Why
- Align implementation with documented mobile-first & Tailwind guidelines; reduce duplication in docs.
### How
- Added `tailwind.config.ts`, `postcss.config.cjs`, updated `globals.css`, refactored pages/layout, pruned README.

## [0.0.14] - 2025-10-19
### Changed
- Translated README to English (content preserved for review).
- Cleaned Next.js guidelines by removing restrictive sections that blocked autonomous changes.
### Why
- Align documentation language and enable faster implementation without artificial blockers.
### How
- Updated [README.md](README.md) and revised [.github/nextjs.instructions.md](.github/nextjs.instructions.md).

## [0.0.13] - 2025-10-19
### Changed
- GitHub guidelines translated to English; added mobile‑first approach and Tailwind usage; relaxed iteration constraints (quality‑first).
### Added
- Project requirements document at `project-requirements-document.md`.
### Why
- Align collaboration and coding standards with planned UI direction and styling choices; capture requirements centrally.
### How
- Updated [.github/github-instructions.md](.github/github-instructions.md); created `project-requirements-document.md`.

# Changelog

All notable changes to this project will be documented in this file.

## [0.0.12] - 2025-10-19
### Added
- Prisma + SQLite persistence in web: schema, client, seed.
- Transactions API now uses Prisma with Zod validation.
### Changed
- Next config transpiles `@doewe/shared`.
- CI runs `db:push` before tests.
### Why
- Persist data beyond reloads and keep shared domain usable in the app.
### How
- Added schema/seed under [apps/web/prisma](apps/web/prisma), API at [apps/web/app/api/transactions/route.ts](apps/web/app/api/transactions/route.ts), singleton client [apps/web/lib/prisma.ts](apps/web/lib/prisma.ts), CI hook in [.github/workflows/ci.yml](.github/workflows/ci.yml).

## [0.0.11] - 2025-10-19
### Added
- Minimal in-memory Transactions Slice in web: API (GET/POST at /api/transactions) und UI (/transactions) basierend auf shared Domain.
- Workspace-Integration von @doewe/shared und Next transpilePackages.
### Changed
- Shared: package.exports/types gesetzt zur Modulauflösung in Next.
- Lint-Fixes in shared (Imports, unused param) und neue lint:fix-Skripte.
- Repo: .nvmrc=20 hinzugefügt und @typescript-eslint auf v7 aktualisiert (keine TS 5.6 Warnung).
### Why
- Frühe End-to-End Validierung der Domain im UI.
### How
- API-Route apps/web/app/api/transactions/route.ts, UI-Seite apps/web/app/transactions/page.tsx.
- Abhängigkeiten/Config aktualisiert (apps/web/package.json, apps/web/next.config.mjs, packages/shared/package.json).

## [0.0.10] - 2025-10-19
### Added
- Domain foundation in shared: money value object [`packages/shared/src/money.ts`](packages/shared/src/money.ts) and transaction model [`packages/shared/src/domain.ts`](packages/shared/src/domain.ts).
- Tests: [`packages/shared/src/money.test.ts`](packages/shared/src/money.test.ts), [`packages/shared/src/domain.test.ts`](packages/shared/src/domain.test.ts).
### Why
- Typ-sichere Beträge in Cent und validierte Transaktionen als Basis für weitere Features.
### How
- Branded Types, Parser/Formatter, Konstruktor mit Validierung auf Basis von [`packages/shared/src/strings.ensureNonEmpty`](packages/shared/src/strings.ts).

## [0.0.9] - 2025-10-19
### Fixed
- CI triggers on all branches and can be started manually.
### Why
- Push to non-main branch (commit 4347575) didn’t match `branches: [main, master]`, so no workflow ran.
### How
- Broadened triggers in [.github/workflows/ci.yml](.github/workflows/ci.yml) to `"**"`; added `workflow_dispatch`.

## [0.0.8] - 2025-10-19
### Fixed
- Vitest Test-Erkennung im Monorepo: Konfiguration angepasst, damit Tests sowohl vom Repo-Root als auch aus Workspaces gefunden werden.
### Why
- `vitest run` beendete mit Code 1: "No test files found".
### How
- `vitest.config.ts` aktualisiert: explizites `root` gesetzt und `include`-Pattern erweitert.

## [0.0.7] - 2025-10-19
### Added
- Vitest root config [vitest.config.ts](vitest.config.ts).
- Sample test in shared: [packages/shared/src/strings.test.ts](packages/shared/src/strings.test.ts) for [`packages/shared/src/strings.ensureNonEmpty`](packages/shared/src/strings.ts).
### Changed
- [`packages/shared/package.json`](packages/shared/package.json) test scripts now run Vitest.
- CI now executes real tests via `npm run test -ws`.
### Why
- Aktive Tests im Monorepo, ausgeführt in CI.
### How
- Vitest als Dev‑Dependency im Root, Root‑Config erstellt, Beispieltest implementiert und Scripts angepasst.

## [0.0.6] - 2025-10-19
### Added
- Minimal CI Workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) running lint, typecheck, test, build on push/PR with Node from [.nvmrc](.nvmrc).
### Why
- Automatisches Qualitäts-Gate für alle PRs/Commits.
### How
- GitHub Actions mit actions/setup-node (npm cache), Workspaces‑Skripte ausgeführt.

## [0.0.5] - 2025-10-19
### Added
- Zentrale ESLint-Basis unter `shared/eslint/eslint.base.cjs`.
- Paket-spezifische ESLint-Konfigurationen in `apps/web` und `packages/shared`, die die Basis erben.
### Changed
- Lint-Skripte auf ESLint-CLI vereinheitlicht (`eslint .`).
- Root-DevDependencies für ESLint/Plugins hinzugefügt.
### Why
- Einheitliche Lint-Regeln ohne Prettier, einfache Wiederverwendung im Monorepo.
### How
- Base-Config erstellt, Package-Configs angepasst, Skripte und DevDeps aktualisiert.

## [0.0.4] - 2025-10-19
### Added
- Zentrale TypeScript-Basis `shared/tsconfig/tsconfig.base.json`.
- `apps/web` und `packages/shared` vererben auf die Basiskonfiguration.
### Changed
- Root-Skripte auf Workspaces (`-ws`) umgestellt.
### Why
- Einheitliche, strikte TS-Regeln; ein Kommando für Typprüfung aller Pakete.
### How
- Basistsconfig angelegt, Projekt-tsconfigs angepasst, Scripts aktualisiert.

## [0.0.3] - 2025-10-19
### Changed
- README strukturiert überarbeitet (Ziele, Setup, Qualität, Sicherheit, nächste Schritte).
- Copilot‑Richtlinien in `.github/github-instructions.md` bereinigt, konsolidiert und auf Deutsch.
### Why
- Klarere Onboarding‑Dokumentation, weniger Redundanz, eindeutige Qualitätsbarrieren.
### How
- Inhalte umgeordnet, Duplikate entfernt, Formulierungen vereinheitlicht, Beispiele konkreter gefasst.

## [0.0.2] - 2025-10-19
### Fixed
- Replaced Next.js config with `next.config.mjs` (was `next.config.ts`) in `apps/web`.
### Why
- Next 14 does not support TypeScript config files.
### How
- Removed `apps/web/next.config.ts`, added `apps/web/next.config.mjs`.

## [0.0.1] - 2025-10-19
### Added
- Scaffolded Next.js (App Router, TypeScript) in `apps/web` with dev/build/lint/typecheck.
- Added root script `dev:web` to run the web app.
### Why
- Start MVP UI schnell nutzbar machen.
### How
- Added Next, React deps, TS config, basic pages/layout/styles.

## [0.0.0] - 2025-10-19
### Added
- Initial repository structure: monorepo workspaces, placeholder scripts, .editorconfig, .gitignore, .npmrc.
- Created `apps/web` and `packages/shared` packages with minimal package.json.
- Added `monorepoTimeline.md` and this changelog.

