/**
 * Pure helpers of the dashboard page — no React, no I/O.
 *
 * The amounts of /api/analytics/summary arrive in euros; anything computed
 * from them here goes through integer cents first.
 */
import type { MonthRef } from "@doewe/shared";

function toCents(euros: number | undefined | null): number {
  return Math.round((euros ?? 0) * 100);
}

/** The fields of the summary that describe this month's standing orders. */
export type RecurringSummaryFields = {
  /** Planned items: due this month, not skipped, not booked yet. */
  recurringTransactions?: ReadonlyArray<unknown>;
  /** Totals of the planned items only — they shrink to 0 as the month's items get booked. */
  recurringIncomeTotal?: number;
  recurringOutcomeTotal?: number;
  /** Totals and count of ALL templates due this month and not skipped, booked or not. */
  recurringDueIncomeTotal?: number;
  recurringDueOutcomeTotal?: number;
  recurringDueCount?: number;
};

export type RecurringDueFigures = { incomeTotal: number; outcomeTotal: number; count: number };

/**
 * What the month's standing orders amount to, independent of how many of them
 * are already booked. Falls back to the planned-only fields when the payload
 * has no `recurringDue*` fields (an offline cache may still hold an old one).
 */
export function recurringDueFigures(summary: RecurringSummaryFields): RecurringDueFigures {
  return {
    incomeTotal: summary.recurringDueIncomeTotal ?? summary.recurringIncomeTotal ?? 0,
    outcomeTotal: summary.recurringDueOutcomeTotal ?? summary.recurringOutcomeTotal ?? 0,
    count: summary.recurringDueCount ?? summary.recurringTransactions?.length ?? 0
  };
}

/** Recurring expenses as a share of the month's projected income, in whole percent (0 without income). */
export function fixedCostRatioPercent(recurringOutcome: number, projectedIncome: number): number {
  const incomeCents = toCents(projectedIncome);
  if (incomeCents <= 0) return 0;
  return Math.max(0, Math.round((toCents(recurringOutcome) / incomeCents) * 100));
}

/** Planned items in the order they fall due; items without a day last, ties by description. */
export function sortByDueDay<Item extends { dayOfMonth: number | null; description: string }>(
  items: readonly Item[]
): Item[] {
  return [...items].sort(
    (a, b) =>
      (a.dayOfMonth ?? Number.POSITIVE_INFINITY) - (b.dayOfMonth ?? Number.POSITIVE_INFINITY) ||
      a.description.localeCompare(b.description)
  );
}

/** The earliest goal month that is the current month or later; null if there is none. */
export function nextGoalDeadline(goals: ReadonlyArray<MonthRef>, current: MonthRef): MonthRef | null {
  const index = (ref: MonthRef) => ref.year * 12 + ref.month;
  let next: MonthRef | null = null;
  for (const goal of goals) {
    if (index(goal) < index(current)) continue;
    if (!next || index(goal) < index(next)) next = { year: goal.year, month: goal.month };
  }
  return next;
}
