/**
 * Effective category budgets of one month (integer cents, keyed by categoryId).
 *
 * Plans (CategoryBudgetPlan) take precedence; a legacy per-month Budget row of
 * the same account/month/year is only a fallback for categories without a plan.
 * YEARLY plans are distributed by the smoothed availability of the year
 * (income spread evenly, recurring expenses/savings per month), which is only loaded when a YEARLY
 * plan exists. Plans of soft-deleted categories are ignored.
 *
 * `loadEffectiveCategoryBudgetsForYear` is the same resolution for all 12 months of a
 * year (index 0 = January, `null` = no budget in that month): a MONTHLY plan gives 12 equal
 * values, a YEARLY plan its distribution; a legacy Budget row only fills the months it exists
 * for, and only for categories without a plan. Saving goals (categoryId null) are ignored.
 */
import {
  BUDGET_PERIODS,
  planMonthlyCents,
  resolveEffectiveBudgets,
  smoothedAvailablePerMonth,
  type BudgetPeriod
} from "@doewe/shared";

import { prisma } from "./prisma";
import { loadRecurringYearMatrix } from "./recurringYear";

function toBudgetPeriod(value: string): BudgetPeriod {
  const match = BUDGET_PERIODS.find((p) => p === value);
  if (!match) throw new Error(`Unknown budget period: ${value}`);
  return match;
}

type CategoryPlan = { categoryId: string; period: BudgetPeriod; amountCents: number };

// Soft-deleted plans are hidden by the extension; the relation filter hides plans of deleted categories.
async function loadCategoryPlans(householdId: string): Promise<CategoryPlan[]> {
  const planRows = await prisma.categoryBudgetPlan.findMany({
    where: { householdId, category: { deletedAt: null } },
    select: { categoryId: true, period: true, amountCents: true }
  });
  return planRows.map((p) => ({
    categoryId: p.categoryId,
    period: toBudgetPeriod(p.period),
    amountCents: p.amountCents
  }));
}

/** Smoothed monthly availability of the year; only loaded when a YEARLY plan needs it. */
async function loadAvailablePerMonth(householdId: string, year: number, plans: CategoryPlan[]): Promise<number[]> {
  if (!plans.some((p) => p.period === "YEARLY")) return Array.from({ length: 12 }, () => 0);
  return smoothedAvailablePerMonth(await loadRecurringYearMatrix(householdId, year));
}

export async function loadEffectiveCategoryBudgets(input: {
  householdId: string;
  accountId: string;
  year: number;
  month: number;
}): Promise<Record<string, number>> {
  const { householdId, accountId, year, month } = input;

  const [plans, budgetRows] = await Promise.all([
    loadCategoryPlans(householdId),
    prisma.budget.findMany({
      where: { accountId, categoryId: { not: null }, month, year },
      select: { categoryId: true, amountCents: true }
    })
  ]);

  const overrides: Record<string, number> = {};
  for (const b of budgetRows) {
    if (b.categoryId) overrides[b.categoryId] = b.amountCents ?? 0;
  }

  const availablePerMonth = await loadAvailablePerMonth(householdId, year, plans);
  return resolveEffectiveBudgets({ plans, overrides, month, availablePerMonth });
}

export async function loadEffectiveCategoryBudgetsForYear(input: {
  householdId: string;
  accountId: string;
  year: number;
}): Promise<Record<string, (number | null)[]>> {
  const { householdId, accountId, year } = input;

  const [plans, budgetRows] = await Promise.all([
    loadCategoryPlans(householdId),
    prisma.budget.findMany({
      // Explicit deletedAt filters (like the plan loader) keep tombstoned rows and categories out.
      where: { accountId, categoryId: { not: null }, year, deletedAt: null, category: { deletedAt: null } },
      select: { categoryId: true, month: true, amountCents: true }
    })
  ]);

  const availablePerMonth = await loadAvailablePerMonth(householdId, year, plans);

  const result: Record<string, (number | null)[]> = {};
  for (const plan of plans) result[plan.categoryId] = planMonthlyCents(plan, availablePerMonth);

  const planned = new Set(plans.map((p) => p.categoryId));
  for (const b of budgetRows) {
    if (!b.categoryId || !b.month || planned.has(b.categoryId)) continue;
    const months = (result[b.categoryId] ??= Array.from({ length: 12 }, () => null));
    months[b.month - 1] = b.amountCents ?? 0;
  }
  return result;
}
