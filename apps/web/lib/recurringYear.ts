/**
 * Loads the recurring-transaction year matrix of a household (shared by
 * GET /api/recurring-transactions/yearly and the budget-plan code, which uses
 * `net.monthlyTotalsCents` as monthly availability).
 *
 * Household-scoped; soft-deleted rows are hidden by the extension in prisma.ts.
 */
import {
  buildRecurringYearMatrix,
  classifyRecurringKind,
  type RecurringYearItem,
  type RecurringYearMatrix
} from "@doewe/shared";

import { SAVINGS_CATEGORY_NAMES } from "../app/api/saving-plan/savings";

import { prisma } from "./prisma";

export async function loadRecurringYearMatrix(householdId: string, year: number): Promise<RecurringYearMatrix> {
  const rows = await prisma.recurringTransaction.findMany({
    where: { account: { householdId } },
    include: { category: true, skips: { where: { year } } },
    orderBy: { description: "asc" }
  });

  const items: RecurringYearItem[] = rows.map((r) => {
    const isSavings = SAVINGS_CATEGORY_NAMES.includes((r.category?.name ?? "").toLowerCase().trim());
    return {
      id: r.id,
      description: r.description,
      categoryId: r.categoryId ?? null,
      categoryName: r.category?.name ?? null,
      kind: classifyRecurringKind(r.amountCents, isSavings),
      amountCents: r.amountCents,
      intervalMonths: r.intervalMonths,
      skippedMonths: r.skips.map((s) => s.month),
      nextYear: r.nextOccurrence.getFullYear(),
      nextMonth: r.nextOccurrence.getMonth() + 1
    };
  });

  return buildRecurringYearMatrix(items, year);
}
