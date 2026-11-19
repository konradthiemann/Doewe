/**
 * Shared savings-pool helpers used by the saving-plan routes.
 *
 * The pool is one figure per household (docs/calculations/00-grundregeln.md
 * §2 and §3): the negated sum of all bookings in ALL savings categories of
 * the household, across all of its accounts. Deposits are stored as NEGATIVE
 * transactions (money leaving the current account), withdrawals as POSITIVE
 * ones (money coming back), so negating the net sum yields a positive balance.
 */
import { isSavingsCategoryName, zonedMonth, zonedMonthRange } from "@doewe/shared";

import { prisma } from "../../../lib/prisma";
import { loadSavingsCategoryIds } from "../../../lib/savingsCategory";

/**
 * The savings category a new pool booking (a withdrawal) is written to: the
 * oldest one, so the choice is stable when a household has several.
 */
export async function findSavingsBookingCategoryId(householdId: string): Promise<string | null> {
  const categories = await prisma.category.findMany({
    where: { householdId },
    select: { id: true, name: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  return categories.find((category) => isSavingsCategoryName(category.name))?.id ?? null;
}

/**
 * Negated net sum of the household's savings bookings, optionally within
 * `[start, end)`. A caller that needs several sums passes the same
 * `savingsIds` (from `loadSavingsCategoryIds`) to each of them.
 */
async function sumSavingsCents(
  householdId: string,
  savingsIds: ReadonlySet<string> | undefined,
  range?: { start: Date; end: Date }
): Promise<number> {
  savingsIds ??= await loadSavingsCategoryIds(householdId);
  if (savingsIds.size === 0) {
    return 0;
  }

  const aggregate = await prisma.transaction.aggregate({
    where: {
      account: { householdId },
      categoryId: { in: [...savingsIds] },
      ...(range ? { occurredAt: { gte: range.start, lt: range.end } } : {})
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
 * Net amount moved into the pool (deposits minus withdrawals, may be negative)
 * within the Europe/Berlin calendar month of `now`.
 */
export async function resolveSavedThisMonthCents(
  householdId: string,
  now: Date,
  savingsIds?: ReadonlySet<string>
): Promise<number> {
  const { year, month } = zonedMonth(now);
  return sumSavingsCents(householdId, savingsIds, zonedMonthRange(year, month));
}

/**
 * Savings pool currently available to spend or withdraw: the raw balance minus
 * the amounts already reserved (withdrawn) for completed goals. Floored at 0.
 */
export async function getAvailableSavingsCents(householdId: string): Promise<number> {
  const [raw, withdrawnAgg] = await Promise.all([
    resolveSavingsBalanceCents(householdId),
    prisma.budget.aggregate({
      where: { account: { householdId }, categoryId: null, completedAt: { not: null } },
      _sum: { spentCents: true }
    })
  ]);
  const withdrawnForCompleted = withdrawnAgg._sum.spentCents ?? 0;
  return Math.max(raw - withdrawnForCompleted, 0);
}
