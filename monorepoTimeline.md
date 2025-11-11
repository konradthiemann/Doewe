- 2025-10-19: Docs alignment. Goal: Allow autonomous changes and English README. How: Removed restrictive parts in [.github/nextjs.instructions.md](.github/nextjs.instructions.md); translated [README.md](README.md).
# Monorepo Timeline

- 2025-10-19: Persistenz (Prisma + SQLite) für Transactions. Goal: Daten über Reloads behalten. How: Schema/Seed in [apps/web/prisma](apps/web/prisma), API auf Prisma umgestellt [apps/web/app/api/transactions/route.ts](apps/web/app/api/transactions/route.ts), CI `db:push`.
- 2025-10-19: Minimaler Transactions-Flow (API+UI) in web. Goal: End-to-End Demo. How: /api/transactions (GET/POST) + /transactions Seite; shared als Workspace genutzt und in Next transpiliert.
- 2025-10-19: Repo-Tooling stabilisiert. Goal: Einheitliche Umgebung & weniger Warnungen. How: .nvmrc=20, @typescript-eslint auf v7, Lint-Fixes.
- 2025-10-19: Update collaboration guidelines (EN). Goal: Mobile‑first + Tailwind policy, relaxed iteration. How: Revised [.github/github-instructions.md](.github/github-instructions.md), added `project-requirements-document.md`.
# Monorepo Timeline

- 2025-10-19: Domain-Fundament (Money, Transaction) in shared inkl. Tests. Goal: Typ-sichere Beträge und validierte Transaktionen. How: [`packages/shared/src/money.ts`](packages/shared/src/money.ts), [`packages/shared/src/domain.ts`](packages/shared/src/domain.ts) + Tests.
- 2025-10-19: Tailwind & a11y integration. Goal: Enforce mobile-first utility styling + baseline accessibility. How: Added Tailwind configs, refactored layout & transactions page, added skip link, trimmed README.
 - 2025-11-11: Budgets & Recurring Transactions. Goal: Introduce planning (monthly budgets) and scheduling (recurring expenses) + richer transaction UX. How: Extended Prisma schema (Budget, RecurringTransaction), added API routes (/api/budgets, /api/recurring-transactions), updated Transactions form with account/category selects, new /budgets page.
