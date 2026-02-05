# Doewe Monorepo

[![CI](https://github.com/konradthiemann/Doewe/actions/workflows/ci.yml/badge.svg)](https://github.com/konradthiemann/Doewe/actions/workflows/ci.yml)
![Node >=18.18.0](https://img.shields.io/badge/node-%3E=18.18.0-339933?logo=node.js)
![Next.js 14.2.5](https://img.shields.io/badge/Next.js-14.2.5-black?logo=next.js)
![TypeScript 5.6.3](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript)

## Project Name and Description
Doewe is a personal finance tracking and insights platform. It helps you record transactions, categorize spending, define and monitor budgets, manage recurring transactions, and surface analytics summaries so you can spot patterns that block financial goals.

Primary goals:
- Strong developer experience (DX) with strict types, linting, testing, and CI.
- Learn and apply modern monorepo + Next.js + TypeScript practices.
- Provide a foundation for future goal‑oriented financial coaching features.

## Technology Stack
Core technologies (derived from workspace manifests and config):
- Runtime: Node.js (>= 18.18.0)
- Framework: Next.js 14.2.5 (App Router)
- Language: TypeScript (strict) / React 18.3.1
- Styling: Tailwind CSS 3.4.x + @tailwindcss/forms
- Data Layer: Prisma ORM 5.19.x with SQLite/PostgreSQL (configurable) & generated client
- Validation: Zod
- Charts/Visualization: chart.js + react-chartjs-2 + chartjs-plugin-datalabels
- Testing: Vitest 1.6.x (unit + integration) & custom test config
- Tooling: ESLint (typescript, import, unused imports), SWC (Next.js build), PostCSS + Autoprefixer
- Monorepo: npm workspaces (apps/*, packages/*)
- Shared Library: `@doewe/shared` for domain primitives (money, strings, domain logic)

## Project Architecture
High-level overview:
```
root
├─ apps/web             # Next.js application (App Router) + API route handlers
│  ├─ app/              # Layout, pages, nested routes, API endpoints under app/api/*
│  ├─ components/       # UI components (forms, charts, etc.)
│  ├─ lib/prisma.ts     # Prisma client bootstrap (singleton pattern)
│  ├─ prisma/           # Prisma schema & seed script
│  ├─ tests/            # API route tests (Vitest)
│  ├─ tailwind.config.ts
│  └─ next.config.mjs   # Next.js config (transpile shared workspace)
├─ packages/shared      # Reusable domain logic (money handling, string utilities)
│  └─ src/              # Domain types & functions with tests
├─ shared/              # Centralized ESLint and tsconfig baselines
│  ├─ eslint/           # ESLint base configuration
│  └─ tsconfig/         # Shared tsconfig for extension
├─ .github/             # Workflows (CI) & prompt/instruction docs
└─ vitest.config.ts     # Global test configuration (monorepo aware)
```

Architectural principles:
- Separation of web/application concerns (`apps/web`) from pure domain logic (`packages/shared`).
- Single Prisma client instance to avoid multi-instance overhead.
- Shared TypeScript configuration and lint baselines to enforce consistency.
- API routes in `app/api/*` follow Next.js route handler pattern (export HTTP verb functions).
- Strict typing + domain primitives (e.g., Money) to reduce runtime errors.
- Mobile‑first responsive UI with accessibility guardrails baked into component patterns.

## Getting Started
### Prerequisites
- Node.js >= 18.18.0 (install via nvm recommended)
- npm (comes with Node)
- PostgreSQL database for Prisma (local Docker is fine)

### Installation & Setup
```bash
# Clone
git clone https://github.com/konradthiemann/Doewe.git
cd Doewe

# (Optional) ensure Node version
nvm use 18

# Install all workspace dependencies
npm ci

# Initialize Prisma schema & seed database for web app
npm --workspace @doewe/web run db:push
npm --workspace @doewe/web run db:seed

# Start development server
npm run dev:web
```

### Local dev with Docker Postgres
If you have Docker Desktop installed, you can run a local database only for local dev:
```bash
# Start local Postgres, migrate + seed, then run the app
npm run dev:web:local

# Stop local Postgres when done
npm run db:down:local
```

### Environment Variables
Create `.env.local` (not committed). Example:
```
DATABASE_URL="postgresql://user:pass@localhost:5432/doewe_local"
NEXTAUTH_SECRET="set-a-strong-random-secret"
NEXTAUTH_URL="http://localhost:3000"
SEED_USER_EMAIL="demo@doewe.test"
SEED_USER_PASSWORD="demo1234"
SEED_USER_NAME="Demo User"
```
After changing schema run:
```bash
npm --workspace @doewe/web run prisma:generate
```

### Migration troubleshooting (non-empty/prod DB)
If a production or Railway database is already populated, Prisma can refuse to apply migrations (P3005) or the schema may drift from the Prisma model (missing columns or incorrect casing like `recurringId` vs `recurringid`). Use this checklist to recover quickly:

1. **Point Prisma at the target DB**
	Ensure `DATABASE_URL` is set to the production database you want to fix.

2. **Try normal deploy first**
	Run `npm --workspace @doewe/web run prisma:migrate:deploy`.

3. **Baseline a non-empty DB (P3005)**
	If Prisma reports the database is not empty, mark the first migration as applied:
	- Use the migration ID from [apps/web/prisma/migrations](apps/web/prisma/migrations) (example: `20260119095855_add_recurring_skip`).
	- Command: `npx prisma migrate resolve --applied <MIGRATION_ID> --schema apps/web/prisma/schema.prisma`.

4. **Re-run deploy**
	Run `npm --workspace @doewe/web run prisma:migrate:deploy` again.

5. **If columns or constraints are still missing**
	Apply the corrective SQL in [apps/web/prisma/migrations/20260119110500_fix_recurring_columns/migration.sql](apps/web/prisma/migrations/20260119110500_fix_recurring_columns/migration.sql). This migration is safe to run multiple times and will:
	- Ensure `RecurringTransaction.intervalMonths` exists
	- Ensure the `RecurringTransactionSkip` columns, FK, and indexes exist

6. **Verify**
	- App starts without `column does not exist` errors.
	- Recurring transactions load and skips can be toggled.

Tip: PostgreSQL is case-sensitive for quoted identifiers. If a column was created as `recurringid` (lowercase), Prisma will still look for `"recurringId"`. The fix migration above normalizes this.

### Local database (Docker)
If you don’t have Postgres locally, run a disposable container:
```bash
docker run --name doewe-postgres -e POSTGRES_USER=doewe -e POSTGRES_PASSWORD=doewe -e POSTGRES_DB=doewe_local -p 5432:5432 -d postgres:16
```
Then set:
```
DATABASE_URL="postgresql://doewe:doewe@localhost:5432/doewe_local"
```
Seed the database (creates a demo account with the `SEED_USER_*` credentials):
```bash
npm --workspace @doewe/web run db:push
npm --workspace @doewe/web run db:seed
```

### Scripts (root)
- `npm run dev:web` – Next.js dev server
- `npm run dev:web:local` – Starts local Postgres (Docker), pushes schema, seeds, then runs dev server
- `npm run db:up:local` / `npm run db:down:local` – Start/stop the local Postgres container
- `npm run lint` / `lint:fix` – ESLint across workspaces
- `npm run typecheck` – TypeScript noEmit across all workspaces
- `npm run test` – Vitest tests (monorepo filter)
- `npm run build` – Build all workspaces (web app + stub others)

## Project Structure
See architecture tree above. Monorepo uses npm workspaces:
- Apps reside in `apps/`
- Shared libraries in `packages/`
- Central config baselines under `shared/`
- Global test config at root; tests colocated per workspace.

## Key Features
Current implemented features include:
- Transaction management (create, edit, delete, list) via `app/api/transactions`.
- Recurring transactions with monthly cadence and skips for upcoming runs.
- Budget endpoints for tracking planned vs actual spending.
- Categories management (`app/api/categories`).
- Recurring transactions handling.
- Analytics summary endpoint (`app/api/analytics/summary`) for aggregated insights.
- Domain utilities (money formatting, numeric handling, string helpers) in `@doewe/shared`.
- Chart visualization using Chart.js to display spending patterns.
- Accessible, mobile‑first UI components styled with Tailwind.

Planned / extensible areas:
- Goal tracking & alerts.
- Advanced anomaly detection across spending categories.
- Multi-user authentication & role-based access (future enhancement).

## Development Workflow
- Conventional Commits for clarity (e.g., `feat: add transaction API`)
- Each commit body includes Goal / Why / How.
- Update `monorepoTimeline.md` and `CHANGELOG.md` with notable changes (newest entries on top).
- CI pipeline (`.github/workflows/ci.yml`) runs: lint → typecheck → test → build with concurrency control.
- Prefer small, incremental PRs; keep quality gates green locally before pushing.
- Branching: flexible (CI runs on all branches); recommend feature branches named `feat/<short-name>` or `chore/<short-name>`.

## Coding Standards
- TypeScript strict everywhere; domain types first.
- Tailwind for styling (avoid inline styles by merge-time).
- Accessibility: follow WCAG 2.2 AA; leverage semantic HTML & ARIA where necessary (see a11y instructions).
- Next.js best practices: App Router, server components by default, isolate client logic in `'use client'` components, avoid `next/dynamic` with `ssr:false` in server components.
- Shared ESLint baseline in `shared/eslint/eslint.base.cjs`; extend in workspaces.
- DRY: prefer pulling common utilities into `@doewe/shared`.
- Secure defaults: no secrets committed; use `.env.example` (to be added) for reference.

## Testing
- Test runner: Vitest (configured globally in `vitest.config.ts`).
- Test locations:
	- Domain tests: `packages/shared/src/*.test.ts`
	- API tests: `apps/web/tests/*.test.ts`
- Strategy: Focus on domain correctness (money/math), API contract validation (status codes, payload shapes), and regression protection for critical logic.
- Run tests:
```bash
npm run test
```
- Type safety acts as first defense; add tests for complex calculations, parsing, and error paths.

## Contributing
Guidelines:
1. Create a branch (`feat/`, `fix/`, `chore/`).
2. Implement change with focus on accessibility, DX, and performance.
3. Run local quality gates:
	 ```bash
	 npm run lint
	 npm run typecheck
	 npm run test
	 ```
4. Update `CHANGELOG.md` and `monorepoTimeline.md` (top‑append newest change).
5. Ensure commit body has Goal / Why / How.
6. Open PR; CI must pass before merge.

Reference Docs:
- Next.js Best Practices: `.github/promps/nextjs.instructions.md`
- Accessibility Guidelines: `.github/promps/a11y.instructions.md`
- Copilot / Collaboration Principles: `.github/promps/github.instructions.md`

## License
No license file present yet. Until a license is added, this code should be treated as "All rights reserved" by default. Recommended next step: add an MIT OR Apache-2.0 `LICENSE` file to clarify usage.

## Suggested Badges (Add After Setup)
- Code Coverage (enable Vitest coverage first)
- Security scan (e.g., Dependabot / Snyk)

## Quick Reference
```bash
# Install & bootstrap
npm ci && npm --workspace @doewe/web run db:push && npm --workspace @doewe/web run db:seed

# Dev server
npm run dev:web

# Prisma generate (after schema change)
npm --workspace @doewe/web run prisma:generate

# Quality gates
npm run lint && npm run typecheck && npm run test
```

## Roadmap (High-Level)
- Authentication & user accounts
- Budget goal alerts via scheduled jobs
- Enhanced analytics (trend lines, category forecasts)
- Export/import (CSV, OFX)
- Performance budget & bundle size tracking

## Acknowledgements
Built with modern Next.js & TypeScript standards, emphasizing accessibility and clean domain modeling.

---
Generated with accessibility, clarity, and maintainability in mind. Please review and adapt as the project evolves.
