/**
 * Shared savings-pool helpers used by the saving-plan routes.
 *
 * Convention (see analytics routes): the savings category holds the running
 * "money set aside" balance. Deposits are stored as NEGATIVE transactions
 * (money leaving the current account), withdrawals as POSITIVE ones (money
 * coming back). Negating the net sum yields a positive pool balance.
 */
import { prisma } from "../../../lib/prisma";

/**
 * Savings category names recognised by the system (EN / DE).
 * The lookup is case-insensitive so "savings", "Savings", "Sparen" etc. all match.
 */
export const SAVINGS_CATEGORY_NAMES = ["savings", "sparen"];

export async function findSavingsCategoryId(userId: string): Promise<string | null> {
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true }
  });
  const match = categories.find((c) =>
    SAVINGS_CATEGORY_NAMES.includes(c.name.toLowerCase().trim())
  );
  return match?.id ?? null;
}

/** Raw savings balance: negated net sum of the savings category. */
export async function resolveSavingsBalanceCents(accountId: string, userId: string): Promise<number> {
  const savingsCatId = await findSavingsCategoryId(userId);

  if (!savingsCatId) {
    return 0;
  }

  const savingsTransactions = await prisma.transaction.findMany({
    where: { accountId, categoryId: savingsCatId },
    select: { amountCents: true }
  });

  // Deposits are negative, withdrawals positive — negate the net to get a
  // positive "set aside" balance.
  return savingsTransactions.reduce((total, tx) => total - tx.amountCents, 0);
}

/**
 * Savings pool currently available to spend or withdraw: the raw balance minus
 * the amounts already reserved (withdrawn) for completed goals. Floored at 0.
 */
export async function getAvailableSavingsCents(accountId: string, userId: string): Promise<number> {
  const [raw, withdrawnAgg] = await Promise.all([
    resolveSavingsBalanceCents(accountId, userId),
    prisma.budget.aggregate({
      where: { accountId, categoryId: null, completedAt: { not: null } },
      _sum: { spentCents: true }
    })
  ]);
  const withdrawnForCompleted = withdrawnAgg._sum.spentCents ?? 0;
  return Math.max(raw - withdrawnForCompleted, 0);
}
