# Doewe Copilot Instructions

Personal finance tracking app built with Next.js 14 (App Router) + TypeScript + Prisma + Tailwind CSS.

## Agent Orchestra

For complex features, use the **Conductor** agent mode in Copilot Chat. It orchestrates specialized subagents through Planning → Implementation → Review → Commit cycles:
- `planning-subagent` – Codebase research & context gathering
- `implement-subagent` – TDD implementation (tests first)
- `code-review-subagent` – Quality validation & code review

Select "Conductor" from the chat mode dropdown to start. Plans are saved to `plans/`.

## Architecture

**Monorepo structure** (npm workspaces):
- `apps/web/` – Next.js app with API routes, Prisma, and UI components
- `packages/shared/` – Domain primitives (`Money`, `Transaction` types, string utilities)
- `shared/` – Centralized ESLint and TSConfig baselines

**Data flow**: UI components → API routes (`app/api/*`) → Prisma client → PostgreSQL

**Key patterns**:
- Singleton Prisma client in [apps/web/lib/prisma.ts](apps/web/lib/prisma.ts) prevents connection issues during hot-reload
- API routes use Zod schemas for validation (see [apps/web/app/api/transactions/schema.ts](apps/web/app/api/transactions/schema.ts))
- Domain types use branded types for type safety (`Cents`, `TransactionId`, `AccountId`)

## Developer Workflow

```bash
# Setup (requires PostgreSQL or Docker)
npm ci
npm run dev:web:local   # Starts Docker Postgres + seeds + runs dev server

# Quality gates (run before commits)
npm run lint && npm run typecheck && npm run test

# After Prisma schema changes
npm --workspace @doewe/web run prisma:generate
```

## Conventions

**Money handling**: Always use `Cents` (integer) to avoid floating-point errors. Use `@doewe/shared` functions:
```typescript
import { parseCents, fromCents, toDecimalString } from "@doewe/shared";
const cents = parseCents("123.45");  // 12345 as Cents
```

**API routes**: Export HTTP verb functions (`GET`, `POST`, `PATCH`, `DELETE`). Always check auth first:
```typescript
const user = await getSessionUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

**Validation**: Use Zod schemas with `@doewe/shared` helpers (e.g., `ensureNonEmpty`):
```typescript
import { ensureNonEmpty } from "@doewe/shared";
const schema = z.object({
  description: z.string().transform((s) => ensureNonEmpty(s))
});
```

**Components**: Use `"use client"` directive only when needed. Import i18n via `useI18n()` hook.

**Testing**: Vitest with tests in:
- `packages/shared/src/*.test.ts` – Domain logic tests
- `apps/web/tests/*.test.ts` – API route tests using `TEST_USER_ID_BYPASS` for auth bypass

**Styling**: Tailwind CSS (mobile-first). Follow WCAG 2.2 AA accessibility guidelines.

**Imports**: Auto-sorted by ESLint (`builtin → external → internal → parent → sibling`).

## Key Files Reference

| Purpose | Location |
|---------|----------|
| Prisma schema | `apps/web/prisma/schema.prisma` |
| API route example | `apps/web/app/api/transactions/route.ts` |
| Domain types | `packages/shared/src/domain.ts` |
| Money utilities | `packages/shared/src/money.ts` |
| Auth helper | `apps/web/lib/auth.ts` |
| i18n translations | `apps/web/lib/locales/{de,en}.ts` |

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`
- Commit body includes: Goal / Why / How
- Update `CHANGELOG.md` and `monorepoTimeline.md` (newest on top)
