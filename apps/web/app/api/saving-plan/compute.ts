/**
 * Pure saving-plan computation — no Prisma, no I/O — so it can be unit-tested directly.
 *
 * Goals are stored as `Budget` rows with `categoryId = null`. A goal is considered
 * "completed" once `completedAt` is set; `spentCents` then holds the amount that was
 * actually withdrawn from the shared savings pool on completion.
 *
 * Completed goals leave the forward-looking plan: they no longer count toward the
 * planned total nor the suggested monthly rate, and the amount withdrawn for them is
 * subtracted from the savings pool that funds the remaining active goals.
 *
 * "Undated" goals (month/year null) are an idea backlog with no deadline. They do
 * NOT participate in the forward-looking plan at all: they are excluded from the
 * planned total, the suggested monthly rate, and the savings-pool cascade.
 *
 * The suggested monthly rate is the amount to set aside in EACH remaining month,
 * the current one included. It is therefore measured against the pool as it stood
 * at the start of the current month: what was deposited this month is the user
 * following the rate, not a reason to lower it. (Counting this month's deposits as
 * covered AND the current month as still open would count the month twice — the
 * rate would drop as soon as the user saves.) "Current month" is the Europe/Berlin
 * calendar month of `now`.
 */
import { zonedMonth } from "@doewe/shared";

export type SavingPlanGoal = {
  /** goal amount; null = no amount set yet (undated ideas may omit it) */
  amountCents: number | null;
  /** null = active, set = completed */
  completedAt: Date | string | null;
  /** amount withdrawn from savings on completion (set only when completed) */
  spentCents: number | null;
  /** target month 1-12, null = undated */
  month: number | null;
  /** target year, null = undated */
  year: number | null;
};

export type SavingPlanTotals = {
  /** raw savings balance before reserving anything for completed goals */
  rawAvailableCents: number;
  /** sum of spentCents across all completed goals */
  withdrawnForCompletedCents: number;
  /** savings pool available to the remaining active goals (floored at 0) */
  availableCents: number;
  /** sum of amountCents across active goals only */
  totalTargetCents: number;
  /** minimum constant monthly amount to reach all active goals on time */
  suggestedMonthlyCents: number;
};

function isCompleted(goal: SavingPlanGoal): boolean {
  return goal.completedAt != null;
}

/** A goal drives the forward-looking plan only if it has a concrete deadline. */
function isScheduled(goal: SavingPlanGoal): goal is SavingPlanGoal & { month: number; year: number } {
  return goal.month != null && goal.year != null;
}

/**
 * Compute the saving-plan totals.
 *
 * @param goals               all goals of the household, sorted by (year, month)
 * @param rawSavingsBalance   the net savings balance (all savings categories)
 * @param now                 reference instant; its Europe/Berlin month is the current month
 * @param savedThisMonthCents net deposits (deposits minus withdrawals) into the savings
 *                            categories within the current month; only affects the
 *                            suggested monthly rate
 */
export function computeSavingPlanTotals(
  goals: SavingPlanGoal[],
  rawSavingsBalance: number,
  now: Date,
  savedThisMonthCents = 0
): SavingPlanTotals {
  // Only dated, non-completed goals drive the forward-looking plan.
  // Undated goals are an idea backlog and are ignored here entirely.
  const activeGoals = goals.filter(
    (goal): goal is SavingPlanGoal & { month: number; year: number } =>
      !isCompleted(goal) && isScheduled(goal)
  );

  const withdrawnForCompletedCents = goals
    .filter(isCompleted)
    .reduce((sum, goal) => sum + (goal.spentCents ?? 0), 0);

  const availableCents = Math.max(rawSavingsBalance - withdrawnForCompletedCents, 0);

  const totalTargetCents = activeGoals.reduce((sum, goal) => sum + (goal.amountCents ?? 0), 0);

  // ── Suggested equal monthly savings (active goals only) ──────────
  // Find the minimum constant monthly amount X such that, by each active
  // goal's deadline, the cumulative savings (X * months) covers the
  // cumulative target up to that deadline.
  //
  // Goals must be sorted by (year, month). For each goal i:
  //   X >= cumulativeRemaining[i] / monthsUntilDeadline[i]
  // The answer is the maximum of those ratios.
  const { year: currentYear, month: currentMonth } = zonedMonth(now); // month 1-12

  // monthsUntil below counts the current month as still open, so the covered
  // amount must be the pool at the start of this month: without this month's
  // net deposits. A net withdrawal this month is not added back — that money
  // is gone from the pool.
  const coveredAtMonthStartCents = Math.max(availableCents - Math.max(savedThisMonthCents, 0), 0);

  let suggestedMonthlyCents = 0;
  let cumulativeAmount = 0;

  for (const goal of activeGoals) {
    cumulativeAmount += goal.amountCents ?? 0;

    // How much of the cumulative target was NOT yet covered when the month began
    const cumulativeRemaining = Math.max(cumulativeAmount - coveredAtMonthStartCents, 0);

    // Months from now until the goal's target month (at least 1)
    const monthsUntil = Math.max(
      (goal.year - currentYear) * 12 + (goal.month - currentMonth),
      1
    );

    const requiredMonthly = Math.ceil(cumulativeRemaining / monthsUntil);
    if (requiredMonthly > suggestedMonthlyCents) {
      suggestedMonthlyCents = requiredMonthly;
    }
  }

  return {
    rawAvailableCents: rawSavingsBalance,
    withdrawnForCompletedCents,
    availableCents,
    totalTargetCents,
    suggestedMonthlyCents
  };
}
