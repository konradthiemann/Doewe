/**
 * Effective category budgets of one month (integer cents, keyed by categoryId).
 *
 * Plans (CategoryBudgetPlan) take precedence; a legacy per-month Budget row of
 * the same account/month/year is only a fallback for categories without a plan.
 * YEARLY plans are distributed by the smoothed availability of the year
 * (income spread evenly, recurring expenses/savings per month), which is only loaded when a YEARLY
 * plan exists. Plans of soft-deleted categories are ignored.
 */
import { BUDGET_PERIODS, resolveEffectiveBudgets, smoothedAvailablePerMonth, type BudgetPeriod } from "@doewe/shared";

import { prisma } from "./prisma";
import { loadRecurringYearMatrix } from "./recurringYear";

function toBudgetPeriod(value: string): BudgetPeriod {
  const match = BUDGET_PERIODS.find((p) => p === value);
  if (!match) throw new Error(`Unknown budget period: ${value}`);
  return match;
}

export async function loadEffectiveCategoryBudgets(input: {
  householdId: string;
  accountId: string;
  year: number;
  month: number;
}): Promise<Record<string, number>> {
  const { householdId, accountId, year, month } = input;

  // Soft-deleted plans are hidden by the extension; the relation filter hides plans of deleted categories.
  const [planRows, budgetRows] = await Promise.all([
    prisma.categoryBudgetPlan.findMany({
      where: { householdId, category: { deletedAt: null } },
      select: { categoryId: true, period: true, amountCents: true }
    }),
    prisma.budget.findMany({
      where: { accountId, categoryId: { not: null }, month, year },
      select: { categoryId: true, amountCents: true }
    })
  ]);

  const plans = planRows.map((p) => ({
    categoryId: p.categoryId,
    period: toBudgetPeriod(p.period),
    amountCents: p.amountCents
  }));
  const overrides: Record<string, number> = {};
  for (const b of budgetRows) {
    if (b.categoryId) overrides[b.categoryId] = b.amountCents ?? 0;
  }

  const needsAvailability = plans.some((p) => p.period === "YEARLY");
  const availablePerMonth = needsAvailability
    ? smoothedAvailablePerMonth(await loadRecurringYearMatrix(householdId, year))
    : Array.from({ length: 12 }, () => 0);

  return resolveEffectiveBudgets({ plans, overrides, month, availablePerMonth });
}
