/**
 * Loads the recurring transactions of a household for a year view (shared by
 * GET /api/recurring-transactions/yearly, the CSV export and the budget-plan
 * code, which derives the monthly availability via `smoothedAvailablePerMonth`).
 *
 * One loader for the yearly page and the CSV, so both read the anchor month in
 * Europe/Berlin and classify the same way: savings category first, then the
 * sign — never `Category.isIncome` (docs/calculations/00-grundregeln.md §1, §2).
 *
 * Household-scoped; soft-deleted rows are hidden by the extension in prisma.ts.
 */
import {
  buildRecurringYearMatrix,
  classifyRecurringKind,
  zonedMonth,
  type RecurringYearItem,
  type RecurringYearMatrix
} from "@doewe/shared";

import { prisma } from "./prisma";
import { loadSavingsCategoryIds } from "./savingsCategory";

export async function loadRecurringYearItems(householdId: string, year: number): Promise<RecurringYearItem[]> {
  const [rows, savingsIds] = await Promise.all([
    prisma.recurringTransaction.findMany({
      where: { account: { householdId } },
      include: { category: true, skips: { where: { year } } },
      orderBy: { description: "asc" }
    }),
    loadSavingsCategoryIds(householdId)
  ]);

  return rows.map((r) => {
    const anchor = zonedMonth(r.nextOccurrence);
    const isSavings = r.categoryId !== null && savingsIds.has(r.categoryId);
    return {
      id: r.id,
      description: r.description,
      categoryId: r.categoryId ?? null,
      categoryName: r.category?.name ?? null,
      kind: classifyRecurringKind(r.amountCents, isSavings),
      amountCents: r.amountCents,
      intervalMonths: r.intervalMonths,
      skippedMonths: r.skips.map((s) => s.month),
      nextYear: anchor.year,
      nextMonth: anchor.month
    };
  });
}

export async function loadRecurringYearMatrix(householdId: string, year: number): Promise<RecurringYearMatrix> {
  return buildRecurringYearMatrix(await loadRecurringYearItems(householdId, year), year);
}
