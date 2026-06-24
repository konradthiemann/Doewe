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
 */

export type SavingPlanGoal = {
  amountCents: number;
  /** null = active, set = completed */
  completedAt: Date | string | null;
  /** amount withdrawn from savings on completion (set only when completed) */
  spentCents: number | null;
  /** target month 1-12 */
  month: number;
  /** target year */
  year: number;
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

/**
 * Compute the saving-plan totals.
 *
 * @param goals            all goals for the account
 * @param rawSavingsBalance the net savings balance (sum of the savings category)
 * @param now              reference date used to compute months-until-deadline
 */
export function computeSavingPlanTotals(
  goals: SavingPlanGoal[],
  rawSavingsBalance: number,
  now: Date
): SavingPlanTotals {
  const activeGoals = goals.filter((goal) => !isCompleted(goal));

  const withdrawnForCompletedCents = goals
    .filter(isCompleted)
    .reduce((sum, goal) => sum + (goal.spentCents ?? 0), 0);

  const availableCents = Math.max(rawSavingsBalance - withdrawnForCompletedCents, 0);

  const totalTargetCents = activeGoals.reduce((sum, goal) => sum + goal.amountCents, 0);

  // ── Suggested equal monthly savings (active goals only) ──────────
  // Find the minimum constant monthly amount X such that, by each active
  // goal's deadline, the cumulative savings (X * months) covers the
  // cumulative target up to that deadline.
  //
  // Goals must be sorted by (year, month). For each goal i:
  //   X >= cumulativeRemaining[i] / monthsUntilDeadline[i]
  // The answer is the maximum of those ratios.
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  let suggestedMonthlyCents = 0;
  const remainingToSave = Math.max(totalTargetCents - availableCents, 0);

  if (remainingToSave > 0 && activeGoals.length > 0) {
    const usedAvailable = availableCents;
    let cumulativeAmount = 0;

    for (const goal of activeGoals) {
      cumulativeAmount += goal.amountCents;

      // How much of the cumulative target is NOT yet covered by existing savings
      const cumulativeRemaining = Math.max(cumulativeAmount - usedAvailable, 0);

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
  }

  return {
    rawAvailableCents: rawSavingsBalance,
    withdrawnForCompletedCents,
    availableCents,
    totalTargetCents,
    suggestedMonthlyCents
  };
}
