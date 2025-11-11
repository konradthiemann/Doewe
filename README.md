# Doewe – Family Management

Family management app to capture finances, set goals, and detect behavioral patterns hindering goal achievement (mobile‑first).

## Tech Stack
- Next.js 14 (App Router), React 18, TypeScript
- Workspace packages: `apps/web`, `packages/shared`
- Persistence: Prisma + SQLite (dev)
- Styling: Tailwind CSS (utility-first, mobile-first)
- Tests: Vitest
- CI: GitHub Actions (lint, typecheck, test, build)

## Quick Start
1. `npm install`
2. Copy `apps/web/.env.example` to `apps/web/.env`
3. `npm run dev:web`
4. Open http://localhost:3000

## Structure
- [`apps/web`](apps/web/package.json) – Web app
- [`packages/shared`](packages/shared/package.json) – Domain & utilities
- [`project-requirements-document.md`](project-requirements-document.md) – Detailed scope & requirements
- [`monorepoTimeline.md`](monorepoTimeline.md) & [`CHANGELOG.md`](CHANGELOG.md) – History & changes
- Guidelines: [.github/promps/github.instructions.md](.github/promps/github.instructions.md)

## Key Feature (current)
- Transactions CRUD (seeded account/category) via `/transactions` and `/api/transactions`

## Documentation
Refer to:
- Requirements: [`project-requirements-document.md`](project-requirements-document.md)
- Guidelines: [.github/promps/github.instructions.md](.github/promps/github.instructions.md)
- Accessibility: [.github/promps/a11y.instructions.md](.github/promps/a11y.instructions.md)

## License
(Define when choosing an OSS strategy.)
