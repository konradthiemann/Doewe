import { PrismaClient } from "@prisma/client";

import { env } from "../env";

// Models that carry a `deletedAt` tombstone (Phase 3b Zwei-Wege-Sync). Reads
// hide tombstoned rows so the rest of the app never sees soft-deleted data.
const SOFT_DELETE_MODELS = new Set([
  "Account",
  "Category",
  "Transaction",
  "RecurringTransaction",
  "Budget",
  "CategoryBudgetPlan"
]);

// Read operations that must exclude tombstones. A caller can still see deleted
// rows on purpose by putting `deletedAt` into the where explicitly (used by the
// sync snapshot and by restore) — then the default filter is not injected.
function withSoftDeleteFilter<T extends { where?: Record<string, unknown> }>(
  model: string | undefined,
  args: T | undefined
): T {
  const a = (args ?? {}) as T;
  if (model && SOFT_DELETE_MODELS.has(model) && a.where?.deletedAt === undefined) {
    (a as { where?: Record<string, unknown> }).where = { ...a.where, deletedAt: null };
  }
  return a;
}

function createPrismaClient() {
  return new PrismaClient({ log: ["warn", "error"] }).$extends({
    name: "soft-delete",
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          return query(withSoftDeleteFilter(model, args));
        },
        async findFirst({ model, args, query }) {
          return query(withSoftDeleteFilter(model, args));
        },
        async findFirstOrThrow({ model, args, query }) {
          return query(withSoftDeleteFilter(model, args));
        },
        async count({ model, args, query }) {
          return query(withSoftDeleteFilter(model, args));
        },
        async aggregate({ model, args, query }) {
          return query(withSoftDeleteFilter(model, args));
        },
        async groupBy({ model, args, query }) {
          return query(withSoftDeleteFilter(model, args));
        }
      }
    }
  });
}

// Single client across hot-reloads in development (avoids exhausting the pool).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Shared client for all DB access. The soft-delete extension centralizes the
// `deletedAt: null` filter so no route has to remember it (a forgotten filter
// would leak tombstoned rows back into the UI). We surface the base
// `PrismaClient` type: the extension only intercepts query args at runtime and
// keeps the delegate surface identical, so every consumer (and the many test
// helpers typed against `PrismaClient`) sees the same shape it always did.
export const prisma = globalForPrisma.prisma ?? (createPrismaClient() as unknown as PrismaClient);

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Options for interactive transactions that take an advisory lock (one
 * standing order). Concurrent requests queue behind the lock while
 * each holds a pooled connection, so the default wait of 2 s for a connection
 * can run out under a burst — on a small pool (CI, a modest database plan) a
 * handful of simultaneous requests is enough — and the request would fail with
 * a 500 instead of waiting its turn.
 */
export const LOCKED_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
