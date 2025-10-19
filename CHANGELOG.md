# Changelog

All notable changes to this project will be documented in this file.

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

