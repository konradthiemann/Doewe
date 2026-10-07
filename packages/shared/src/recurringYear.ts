/**
 * Pure year matrix of recurring transactions — no Prisma, no I/O.
 *
 * One row per recurring item with the signed amount (integer cents) due in each
 * month of the given year (anchor month + interval via `isRecurringDueInMonth`,
 * minus explicitly skipped months). Rows are grouped into income, expenses and
 * savings; each group carries per-month sums, a year total and a rounded
 * monthly average. `net` is the signed sum across all groups.
 */
import { isRecurringDueInMonth } from "./recurringSchedule";

export type RecurringKind = "income" | "expense" | "savings";

export type RecurringYearItem = {
  id: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  kind: RecurringKind;
  /** Signed cents as stored (income positive, expenses/savings negative). */
  amountCents: number;
  intervalMonths: number;
  /** Months (1-12) of the requested year that were explicitly skipped. */
  skippedMonths: number[];
  nextYear: number;
  nextMonth: number; // 1-12
};

export type RecurringYearRow = {
  id: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  kind: RecurringKind;
  amountCents: number;
  intervalMonths: number;
  /** 12 entries (Jan-Dec); 0 where the item is not due or was skipped. */
  monthlyCents: number[];
  totalCents: number;
};

export type RecurringYearTotals = {
  monthlyTotalsCents: number[];
  totalCents: number;
  monthlyAverageCents: number;
};

export type RecurringYearGroup = RecurringYearTotals & { rows: RecurringYearRow[] };

export type RecurringYearMatrix = {
  year: number;
  income: RecurringYearGroup;
  expenses: RecurringYearGroup;
  savings: RecurringYearGroup;
  net: RecurringYearTotals;
};

const MONTHS = 12;
const sumOf = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Savings wins over the sign; otherwise amounts >= 0 count as income. */
export function classifyRecurringKind(amountCents: number, isSavings: boolean): RecurringKind {
  if (isSavings) return "savings";
  return amountCents >= 0 ? "income" : "expense";
}

function buildRow(item: RecurringYearItem, year: number): RecurringYearRow {
  const monthlyCents = Array.from({ length: MONTHS }, (_, index) => {
    const month = index + 1;
    if (item.skippedMonths.includes(month)) return 0;
    const due = isRecurringDueInMonth({
      nextYear: item.nextYear,
      nextMonth: item.nextMonth,
      intervalMonths: item.intervalMonths,
      year,
      month
    });
    return due ? item.amountCents : 0;
  });
  return {
    id: item.id,
    description: item.description,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    kind: item.kind,
    amountCents: item.amountCents,
    intervalMonths: item.intervalMonths,
    monthlyCents,
    totalCents: sumOf(monthlyCents)
  };
}

function totalsOf(monthlyTotalsCents: number[]): RecurringYearTotals {
  const totalCents = sumOf(monthlyTotalsCents);
  return { monthlyTotalsCents, totalCents, monthlyAverageCents: Math.round(totalCents / MONTHS) };
}

function buildGroup(rows: RecurringYearRow[]): RecurringYearGroup {
  const monthly = Array.from({ length: MONTHS }, (_, i) => sumOf(rows.map((r) => r.monthlyCents[i])));
  return { rows, ...totalsOf(monthly) };
}

export function buildRecurringYearMatrix(items: RecurringYearItem[], year: number): RecurringYearMatrix {
  const rows = items.map((item) => buildRow(item, year));
  const income = buildGroup(rows.filter((r) => r.kind === "income"));
  const expenses = buildGroup(rows.filter((r) => r.kind === "expense"));
  const savings = buildGroup(rows.filter((r) => r.kind === "savings"));
  const net = totalsOf(
    Array.from(
      { length: MONTHS },
      (_, i) => income.monthlyTotalsCents[i] + expenses.monthlyTotalsCents[i] + savings.monthlyTotalsCents[i]
    )
  );
  return { year, income, expenses, savings, net };
}
