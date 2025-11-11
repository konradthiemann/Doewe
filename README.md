# Doewe – Family Management

The goal is to develop a family management system that helps quickly capture finances, set goals, and earmark potential expenses. Based on the collected data, the app should detect patterns and analyze behavior to reveal obstacles to achieving goals.

## Status
- Learning project by a single developer
- Incremental development with a focus on code quality

## Persona
- Primary users are parents aged 20–40.

## MVP Scope (first iteration)
- Manage accounts and categories
- Record transactions (one‑time, recurring)
- Define budgets and goals
- Simple insights/analytics

Non‑Goals for the MVP
- No native mobile app
- No multi‑tenancy
- No production deployment

## Tech Stack
- App: Next.js 14 (App Router), React 18, TypeScript
- Monorepo: npm Workspaces (apps/*, packages/*)
- Node: 20.x recommended (CI uses 20; local deviations may cause dev issues)
- Lint/Typecheck/Tests: added iteratively
- Tailwind for styling

## Quick Start
1) Install
   - `npm install`
2) Start development
   - `npm run dev:web` (starts [apps/web](apps/web))
3) Open
   - http://localhost:3000

## Useful Scripts
- Root
  - `dev:web` – Dev server for the web app
- App (see [apps/web/package.json](apps/web/package.json))
  - `dev`, `build`, `start`, `lint`, `typecheck`

## Repository Structure
- apps/web – Next.js App (App Router)
- packages/shared – Shared types/domain/utilities
- .github – Project guidelines ([.github/github-instructions.md](.github/github-instructions.md))
- CHANGELOG.md – Change log (root)
- monorepoTimeline.md – Chronological developer timeline (newest first)

## Quality Rules (short)
- Strict typing
- Lint/Typecheck/Tests required before merges (will be expanded)
- No secrets in the repo, maintain `.env.example`

## Security
- Use environment variables, do not commit sensitive data
- Validate inputs, avoid unsafe patterns

## Next Steps
- Centralize ESLint/TS baselines
- Add minimal CI workflow
- Sketch domain models and initial use cases

## UI Demo
- Transactions: http://localhost:3000/transactions (Create form and list)
