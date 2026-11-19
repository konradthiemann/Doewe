/**
 * Shared savings-pool helpers used by the saving-plan routes.
 *
 * The pool is one figure per household (docs/calculations/00-grundregeln.md
 * §2 and §3): the negated sum of all bookings in ALL savings categories of
 * the household, across all of its accounts. Deposits are stored as NEGATIVE
 * transactions (money leaving the current account), withdrawals as POSITIVE
 * ones (money coming back), so negating the net sum yields a positive balance.
 *
 * Completing a goal books a real withdrawal, so "available" is that balance.
 * Only goals completed before withdrawals were booked still hold an amount
 * back (`Budget.reservedCents`, set once by the migration).
 *
 * The helpers that feed a write take the database client as an argument, so
 * the routes can read the pool inside the transaction that changes it.
 */
import { isSavingsCategoryName, zonedMonth, zonedMonthRange } from "@doewe/shared";

import { prisma } from "../../../lib/prisma";
import { loadSavingsCategoryIds } from "../../../lib/savingsCategory";

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Serialises the writes that take money out of a household's pool (withdraw,
 * complete a goal) for the rest of the transaction: two of them running at the
 * same moment would otherwise both read the same balance and together take out
 * more than there is.
 */
export async function lockSavingsPool(tx: Prisma.TransactionClient, householdId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`savings-pool:${householdId}`}))`;
}

/**
 * The savings category a new pool booking (a withdrawal) is written to: the
 * oldest one, so the choice is stable when a household has several.
 */
export async function findSavingsBookingCategoryId(householdId: string, db: Db = prisma): Promise<string | null> {
  const categories = await db.category.findMany({
    // Explicit deletedAt, so the result does not depend on which client runs the query.
    where: { householdId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  return categories.find((category) => isSavingsCategoryName(category.name))?.id ?? null;
}

/**
 * Negated net sum of the household's savings bookings, optionally within
 * `[start, end)` and optionally only the deposits (negative amounts). A caller
 * that needs several sums passes the same `savingsIds` (from
 * `loadSavingsCategoryIds`) to each of them.
 */
async function sumSavingsCents(
  householdId: string,
  savingsIds: ReadonlySet<string> | undefined,
  range?: { start: Date; end: Date },
  db: Db = prisma,
  depositsOnly = false
): Promise<number> {
  savingsIds ??= await loadSavingsCategoryIds(householdId, db);
  if (savingsIds.size === 0) {
    return 0;
  }

  const aggregate = await db.transaction.aggregate({
    where: {
      account: { householdId },
      categoryId: { in: [...savingsIds] },
      deletedAt: null,
      ...(range ? { occurredAt: { gte: range.start, lt: range.end } } : {}),
      ...(depositsOnly ? { amountCents: { lt: 0 } } : {})
    },
    _sum: { amountCents: true }
  });

  // Deposits are negative, withdrawals positive — negate the net to get a
  // positive "set aside" balance. `0 -` avoids returning -0.
  return 0 - (aggregate._sum.amountCents ?? 0);
}

/** Raw savings balance of the household: all savings categories, all accounts. */
export async function resolveSavingsBalanceCents(
  householdId: string,
  savingsIds?: ReadonlySet<string>
): Promise<number> {
  return sumSavingsCents(householdId, savingsIds);
}

/**
 * Gross amount deposited into the pool (deposits only, withdrawals NOT
 * subtracted, never negative) within the Europe/Berlin calendar month of `now`.
 * The pool minus this is what was covered when the month began, with this
 * month's withdrawals already taken out (see computeSavingPlanTotals).
 */
export async function resolveDepositedThisMonthCents(
  householdId: string,
  now: Date,
  savingsIds?: ReadonlySet<string>
): Promise<number> {
  const { year, month } = zonedMonth(now);
  return sumSavingsCents(householdId, savingsIds, zonedMonthRange(year, month), prisma, true);
}

/**
 * Savings pool currently available to spend or withdraw: the raw balance minus
 * what goals completed before withdrawals were booked still hold back
 * (`reservedCents`; nothing for everyone else). Floored at 0.
 */
export async function getAvailableSavingsCents(householdId: string, db: Db = prisma): Promise<number> {
  // One after the other: inside a transaction both run on the same connection.
  const raw = await sumSavingsCents(householdId, undefined, undefined, db);
  const reservedAgg = await db.budget.aggregate({
    where: { account: { householdId }, categoryId: null, completedAt: { not: null }, deletedAt: null },
    _sum: { reservedCents: true }
  });
  return Math.max(raw - (reservedAgg._sum.reservedCents ?? 0), 0);
}
