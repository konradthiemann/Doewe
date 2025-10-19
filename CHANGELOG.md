# Changelog

All notable changes to this project will be documented in this file.

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

