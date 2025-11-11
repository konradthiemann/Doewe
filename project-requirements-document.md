# Project Requirements – Doewe

Version: 0.1 (living document)

## 1. Overview
- Purpose: A family management app to quickly capture finances, set goals, and earmark potential expenses. Based on collected data, detect patterns and behaviors that hinder goal achievement.
- Mobile‑first: Design and UX decisions prioritize small screens; scale gracefully to larger viewports.
- Status: Learning project driven by one developer.

## 2. Personas
- Primary: Parents aged 20–40 who manage household budgets and expenses (per [README.md](README.md)).

## 3. Goals (MVP)
- Manage accounts and categories.
- Record transactions (one‑time and recurring).
- Define budgets and goals.
- Provide simple insights/analytics.

Non‑goals (MVP)
- No mobile apps.
- No multi‑tenancy.
- No production deployment initially.

## 4. Functional Requirements
- Accounts: CRUD, link to transactions.
- Categories: CRUD, unique names.
- Transactions:
  - Create with accountId, optional categoryId, amount in cents, description, occurredAt.
  - List, sort by occurredAt desc.
  - Later: recurring rules (frequency, next occurrence).
- Budgets/Goals: Define target amounts and timeframes (future iteration).
- Insights: Summaries by category/time, basic trend indicators (future iteration).

## 5. Non‑Functional Requirements
- Accessibility: WCAG 2.2 AA (see [.github/a11y-instructions.md](.github/a11y-instructions.md)).
- Performance: Fast TTI on mobile; minimize client JS (favor Server Components); responsive images/fonts later.
- Security: Input validation (Zod), sanitize outputs, no secrets in VCS.
- Privacy: Local dev DB; later data retention/export policy.
- i18n/l10n: German first; extensible to English later.
- Reliability: CI gates (lint/typecheck/tests/build).
- DX: Monorepo with shared types/utilities, strict TypeScript and ESLint baseline.

## 6. Architecture
- Monorepo (npm workspaces): `apps/web` (Next.js App Router), `packages/shared` (domain/types/utils).
- UI: Next.js 14 (App Router), React 18, Tailwind CSS, mobile‑first.
- API: Next.js Route Handlers at `app/api/*` with Zod validation.
- Domain (shared): Money value object and transaction model in [`packages/shared`](packages/shared).
  - Money: [`packages/shared/src/money.ts`](packages/shared/src/money.ts)
  - Transaction: [`packages/shared/src/domain.ts`](packages/shared/src/domain.ts)
- Data: Prisma + SQLite (dev).
  - Schema: [`apps/web/prisma/schema.prisma`](apps/web/prisma/schema.prisma)
  - Seed: [`apps/web/prisma/seed.js`](apps/web/prisma/seed.js)
  - Client singleton: [`apps/web/lib/prisma.ts`](apps/web/lib/prisma.ts)
- Testing: Vitest root config [`vitest.config.ts`](vitest.config.ts), tests in shared.

## 7. Current Routes & Screens
- `/` – Home.
- `/transactions` – List + form to create; aligned with API.
- `/budgets` – List + form to create monthly budgets.
- API:
  - `GET /api/transactions` – list.
  - `POST /api/transactions` – create with body: `{ accountId, amountCents, description, occurredAt, categoryId? }` implemented in [`apps/web/app/api/transactions/route.ts`](apps/web/app/api/transactions/route.ts).
   - `GET /api/accounts` / `POST /api/accounts` – list/create accounts.
   - `GET /api/categories` / `POST /api/categories` – list/create categories.
   - `GET /api/budgets` / `POST /api/budgets` – list/create budgets.
   - `GET /api/recurring-transactions` / `POST /api/recurring-transactions` – list/create recurring transactions.

## 8. Data Model
- Account: id (cuid or fixed for seed), name, createdAt.
- Category: id (cuid), name (unique), createdAt.
- Transaction: id (cuid), accountId (FK), optional categoryId (FK), amountCents (Int), description (String), occurredAt (DateTime), createdAt (DateTime). See schema.

## 9. Validation
- Zod schemas in API (see [`apps/web/app/api/transactions/route.ts`](apps/web/app/api/transactions/route.ts)).
- Domain helpers in shared:
  - `ensureNonEmpty` in [`packages/shared/src/strings.ts`](packages/shared/src/strings.ts)
  - Money parse/format in [`packages/shared/src/money.ts`](packages/shared/src/money.ts)

## 10. Tooling & CI/CD
- Node 20 (see [.nvmrc](.nvmrc)).
- Lint/Typecheck/Test/Build scripts at root [`package.json`](package.json).
- CI: GitHub Actions running lint, typecheck, tests (with `db:push`), build in [.github/workflows/ci.yml](.github/workflows/ci.yml).

## 11. Styling
- Tailwind CSS to be used for styling with a utility‑first approach.
- Adopt mobile‑first responsive patterns using Tailwind breakpoints.
- Maintain consistent spacing, typography, and color scales via Tailwind config (to be added).

## 14. Dashboard & Visualization
- Dashboard (landing page) provides a visual overview using Chart.js via `react-chartjs-2`.
- Initial charts:
   - Pie (doughnut): Outgoings distribution by category for current month.
   - Bar: Income vs. Outcome totals for current month.
- Demo categories used for outgoings: clothing, hobbies, eating out, food order, cosmetics, drugstore, presents, mobility, special, health, interior, misc.
- Demo income sources: salary1, salary2, child benefit, misc.
- Accessibility: Chart sections include headings and descriptive text; consider data table equivalents for screen readers in future iterations.

## 12. Risks & Assumptions
- Single‑developer velocity; scope must remain focused.
- SQLite fits dev; migration to Postgres later may be required.
- No auth yet; multi‑user support out of scope for MVP.

## 13. Open Questions (to decide)
1) Authentication/Users
   - Do we need user accounts in MVP (local only vs. hosted later)? If so, what auth provider/flow?
2) Budget & Goals
   - Minimal viable data model: per category per month? rolling? hard caps vs. soft targets?
3) Recurring Transactions
   - Which recurrence rules (daily/weekly/monthly with anchors)? How to materialize and audit?
4) Insights/Analytics
   - Which first KPIs matter (spend per category/month, savings rate, burn vs. budget)?
5) Currency & Localization
   - EUR only or multi‑currency? Number/date formats per locale?
6) Category Taxonomy
   - Fixed starter set or user‑defined only? Any protected categories?
7) Data Lifecycle
   - Export (CSV/JSON), backup/restore; data deletion policy?
8) Accessibility
   - Any specific screen reader, keyboard, or color contrast targets beyond WCAG 2.2 AA?
9) Performance Budgets
   - Target LCP/INP/CLS on mobile? Any constraints for bundle sizes?
10) Deployment
   - Planned hosting (Vercel, Fly, custom)? Preview environments? Env management strategy?
11) Tailwind Adoption
   - Preferred UI primitives/components (tables, forms) and design tokens to encode in Tailwind config?
12) Error Handling
   - UX for validation errors in forms, and API error shapes (problem+json?) across the app?
13) Roadmap Priorities
   - After Transactions CRUD, should we prioritize Budgets, Categories UX, or Insights first?

Please answer these questions so we can refine the requirements to expert standard and lock a short‑term roadmap.