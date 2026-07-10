# Project Requirements – Doewe

Version: 0.2 (living document — status claims updated 2026-07 to match the implemented state; for current technical details see [Architecture](./architecture.md), [Data Model](./data-model.md), and [API Reference](./api-reference.md))

## 1. Overview
- Purpose: A family management app to quickly capture finances, set goals, and earmark potential expenses. Based on collected data, detect patterns and behaviors that hinder goal achievement.
- Mobile‑first: Design and UX decisions prioritize small screens; scale gracefully to larger viewports.
- Status: Learning project driven by one developer.

## 2. Personas
- Primary: Parents aged 20–40 who manage household budgets and expenses.

## 3. Goals (MVP)
- Manage accounts and categories.
- Record transactions (one‑time and recurring).
- Define budgets and goals.
- Provide simple insights/analytics.

Non‑goals (MVP)
- No mobile apps.
- No multi‑tenancy.
- ~~No production deployment initially~~ — superseded: the app is deployed on Railway (see [Deployment & CI](./deployment.md)).

## 4. Functional Requirements
- Accounts: CRUD, link to transactions.
- Categories: CRUD, unique names.
- Transactions:
  - Create with accountId, optional categoryId, amount in cents, description, occurredAt.
  - List, sort by occurredAt desc.
  - Recurring rules — **implemented** (`RecurringTransaction` with `intervalMonths`, `dayOfMonth`, `nextOccurrence`, plus per-month skips).
- Budgets/Goals — **implemented** (category budgets per month; saving goals as `Budget` rows with `categoryId = null`, dated or undated, with complete/reopen and withdraw).
- Insights — **implemented** (`/api/analytics/summary`, `/api/analytics/quarterly`, `/api/analytics/monthly-review`; dashboard + `/review` page).
- Tax preparation — **implemented** (earmark transactions via `Transaction.taxRelevant`, receipt attachments as PostgreSQL bytes with MIME/size limits, tax-relevant categories with retroactive backfill, per-year overview on `/tax`; see [User Flows — Flow 6](./flows.md)).

## 5. Non‑Functional Requirements
- Accessibility: WCAG 2.2 AA (see [.github/prompts/a11y.instructions.md](../.github/prompts/a11y.instructions.md)).
- Performance: Fast TTI on mobile; minimize client JS (favor Server Components); responsive images/fonts later.
- Security: Input validation (Zod), sanitize outputs, no secrets in VCS.
- Privacy: Local dev DB; later data retention/export policy.
- i18n/l10n: German first; English is implemented (runtime switch, `lib/locales/de.ts` + `en.ts`).
- Reliability: CI gates (lint/typecheck/tests/build).
- DX: Monorepo with shared types/utilities, strict TypeScript and ESLint baseline.

## 6. Architecture
- Monorepo (npm workspaces): `apps/web` (Next.js App Router), `packages/shared` (domain/types/utils).
- UI: Next.js 14 (App Router), React 18, Tailwind CSS, mobile‑first.
- API: Next.js Route Handlers at `app/api/*` with Zod validation.
- Domain (shared): Money value object and transaction model in [`packages/shared`](../packages/shared).
  - Money: [`packages/shared/src/money.ts`](../packages/shared/src/money.ts)
  - Transaction: [`packages/shared/src/domain.ts`](../packages/shared/src/domain.ts)
- Data: Prisma + PostgreSQL everywhere (local: Docker `postgres:16`, CI: GitHub Actions service, prod: Railway).
  - Schema: [`apps/web/prisma/schema.prisma`](../apps/web/prisma/schema.prisma)
  - Seed: [`apps/web/prisma/seed.js`](../apps/web/prisma/seed.js)
  - Client singleton: [`apps/web/lib/prisma.ts`](../apps/web/lib/prisma.ts)
- Testing: Vitest root config [`vitest.config.ts`](../vitest.config.ts) — domain tests in `packages/shared/src`, API integration tests in `apps/web/tests`.

## 7. Current Routes & Screens
- Screens: `/` (dashboard), `/transactions`, `/saving-plan`, `/review`, `/tax` (tax preparation, reachable via drawer/sidebar only), `/settings`, `/login`, `/forgot-password`, `/reset-password`, `/impressum`, `/datenschutz`. (`/budgets` is a redirect to `/saving-plan`.)
- API: transactions (+ [id]/attachments), attachments, tax, recurring-transactions (+ skips), budgets, saving-plan (+ complete/withdraw), categories, accounts, analytics (summary/quarterly/monthly-review), auth (register, password flows), demo seed — see the [API Reference](./api-reference.md) for the complete, authoritative list.

## 8. Data Model
The schema has grown well beyond the MVP sketch (user scoping with `userId` on Account/Category, `isIncome`, saving-goal linking, recurring transactions with skips, password-reset tokens). The authoritative description lives in [Data Model](./data-model.md) and `apps/web/prisma/schema.prisma`.

## 9. Validation
- Zod schemas in API (see [`apps/web/app/api/transactions/route.ts`](../apps/web/app/api/transactions/route.ts)).
- Domain helpers in shared:
  - `ensureNonEmpty` in [`packages/shared/src/strings.ts`](../packages/shared/src/strings.ts)
  - Money parse/format in [`packages/shared/src/money.ts`](../packages/shared/src/money.ts)

## 10. Tooling & CI/CD
- Node 22 (pinned via [.nvmrc](../.nvmrc), currently 22.14.0).
- Lint/Typecheck/Test/Build scripts at root [`package.json`](../package.json).
- CI: GitHub Actions running lint, typecheck, tests (with `db:push`), build in [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## 11. Styling
- Tailwind CSS with a utility‑first approach (config: `apps/web/tailwind.config.ts` + `@tailwindcss/forms`).
- Mobile‑first responsive patterns using Tailwind breakpoints (persistent sidebar at `md`+, bottom tab bar below).

## 14. Dashboard & Visualization
- Dashboard (landing page) provides a visual overview using Chart.js via `react-chartjs-2` (`Doughnut` + `Bar`).
- Implemented charts (see `apps/web/app/page.tsx`):
   - Doughnut: outgoings distribution by **expense category** for the current month (savings/remaining funds are shown separately, e.g. as a segmented progress bar — not as doughnut slices).
   - Daily chart: cumulative income/outcome/savings series across the days of the current month (from `summary.daily`).
- Demo data (36 deterministic months) is defined in `apps/web/lib/demoData.js` — categories and income sources live there, not in this document.
- Accessibility: Chart sections include headings and descriptive text, with accessible progress bar semantics; consider data table equivalents for screen readers in future iterations.

### Dynamic Planned Savings & Predictive Outcomes

> **Status:** implemented with a different design than sketched below. There are no
> `PredictiveOutcome`/`Allocation` models — saving goals are `Budget` rows with
> `categoryId = null` (dated or undated), and the monthly suggestion is computed
> on the fly in `apps/web/app/api/saving-plan/compute.ts`. The section below is
> kept as the original design sketch.

Users can define upcoming large expenses (predictive outcomes), e.g., "Christmas presents (1000€ by Dec)", "New wheels (600€ by Nov)".

Mechanism:
1. Each predictive outcome has a target amount and a target month (deadline).
2. The system calculates a monthly saving allocation for each remaining month until its deadline: target remaining / months remaining.
3. When multiple predictive outcomes overlap, monthly allocations compete for the same available saving capacity; allocation is proportional or sequentially adjusted so total planned savings for the month does not exceed user-defined feasible saving ceiling (initially the Budget planned savings record for the month).
4. If actual savings in a month fall short of the allocated amount, the shortfall is redistributed evenly (or proportionally) across remaining months before each outcome's deadline.
5. If actual savings exceed the allocated amount, future monthly allocations are reduced accordingly, potentially bringing forward completion of goals.
6. The pie chart shows only the current month's planned and actual savings portions: actual savings slice (money moved to Savings category transactions this month), and remaining-to-save slice (planned minus actual for month). Historical overruns/shortfalls are reflected in recalculated future allocations, not retroactively altering past slices.

Data Model Additions (future iteration):
- PredictiveOutcome: id, accountId, name, targetAmountCents, targetMonth, targetYear, createdAt, optional categoryId.
- Allocation: outcomeId, month, year, plannedAmountCents, adjustedAt.

Algorithm Outline (allocation recompute):
1. Gather all active outcomes (current date <= target deadline).
2. Compute monthsRemaining for each.
3. Initial monthlyNeed = (remainingTargetAmount) / monthsRemaining (ceil to cents). RemainingTargetAmount subtracts outcome-related actual savings already attributed (needs attribution logic).
4. Sum monthlyNeed across outcomes; if sum <= budgeted plannedSavings for month, accept. Else scale down proportionally by (plannedSavings / sum).
5. After month end, compare actual vs allocated per outcome; update remainingTargetAmount and recompute allocations for future months.

Edge Cases:
- Outcomes expiring this month: allocate entire remaining amount if feasible else flag underfunded.
- Added outcome mid-month: first allocation applies immediately; if insufficient headroom, proportional scaling occurs.
- Early completion: outcome removed from future allocation cycle.

This dynamic plan feeds future UI components (e.g., progress bars per outcome) and can later power forecasting tables.

## 12. Risks & Assumptions
- Single‑developer velocity; scope must remain focused.
- ~~SQLite fits dev; migration to Postgres later may be required~~ — done: PostgreSQL is used in dev, CI, and prod.
- ~~No auth yet~~ — done: NextAuth (Credentials) with per-user data scoping is implemented.

## 13. Open Questions (to decide)

> Several of these have since been decided in code: **Q1** auth = NextAuth
> CredentialsProvider with its own `User` model; **Q3** recurrence =
> `intervalMonths` + `dayOfMonth` with per-month skips; **Q10** hosting = Railway
> (see [Deployment & CI](./deployment.md)); **Q11** Tailwind config exists.

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