/**
 * Pure recurring-transaction due-date logic — no Prisma, no I/O.
 *
 * A RecurringTransaction has an anchor month (`nextOccurrence`, split by the
 * caller into nextYear/nextMonth) and repeats every `intervalMonths` months
 * from there. This was previously duplicated between the analytics summary
 * endpoint and the budget-alert check; both now share this module.
 */

export type RecurringAnchor = {
  nextYear: number;
  nextMonth: number; // 1-12
  intervalMonths: number;
};

export type MonthRef = { year: number; month: number };

/** Whether a recurring transaction with the given anchor is due in (year, month). */
export function isRecurringDueInMonth(params: RecurringAnchor & MonthRef): boolean {
  const { nextYear, nextMonth, year, month } = params;
  if (nextYear === year && nextMonth === month) return true;

  const interval = params.intervalMonths || 1;
  const monthsSinceNext = (year - nextYear) * 12 + (month - nextMonth);
  return monthsSinceNext >= 0 && monthsSinceNext % interval === 0;
}

/**
 * Every (year, month) at which a recurring transaction was or is due, from its
 * anchor month up to and including the reference month (`untilYear`/`untilMonth`).
 * Used both for the current month's due-check and for backfilling past,
 * never-booked occurrences in one pass.
 */
export function dueMonthsBetween(
  params: RecurringAnchor & { untilYear: number; untilMonth: number }
): MonthRef[] {
  const { nextYear, nextMonth, untilYear, untilMonth } = params;
  const interval = params.intervalMonths || 1;

  const totalMonthsSinceNext = (untilYear - nextYear) * 12 + (untilMonth - nextMonth);
  if (totalMonthsSinceNext < 0) return [];

  const result: MonthRef[] = [];
  for (let offset = 0; offset <= totalMonthsSinceNext; offset += interval) {
    const absoluteMonth = (nextMonth - 1) + offset;
    const year = nextYear + Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    result.push({ year, month });
  }
  return result;
}
