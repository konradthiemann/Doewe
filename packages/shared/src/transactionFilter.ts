/**
 * Filter and totals of the transaction list — no React, no I/O.
 *
 * The list must be able to reproduce every figure of the analytics screens
 * from the same rows: its type filter uses the same classification
 * (`classifyFlow`) and its date range the same calendar (`zonedDayRange`) as
 * the server. Filtering a month here and summing "outcome" gives the review's
 * outcome for that month.
 */
import { parseDayKey, zonedDayRange, zonedMonth, daysInMonth, APP_TIME_ZONE } from "./calendar";
import { classifyFlow, sumFlows, type FlowKind, type FlowRow, type FlowTotals } from "./cashflow";

import type { MonthRef } from "./recurringSchedule";

export type TransactionTypeFilter = "all" | FlowKind;

export type ListFilter = {
  type?: TransactionTypeFilter;
  /** Exact category id; empty or undefined = all categories. */
  categoryId?: string | null;
  /** First day included, `yyyy-mm-dd` (calendar day in `timeZone`). */
  fromDay?: string | null;
  /** Last day included in full, `yyyy-mm-dd` (calendar day in `timeZone`). */
  toDay?: string | null;
  timeZone?: string;
};

export type ListRow = FlowRow & { occurredAt: string | Date };

function toMs(value: string | Date): number {
  return (typeof value === "string" ? new Date(value) : value).getTime();
}

/**
 * Rows matching type, category and date range. An unparseable day is ignored
 * (treated as "no bound"), so a half-typed date never empties the list.
 */
export function filterTransactions<Row extends ListRow>(
  rows: readonly Row[],
  filter: ListFilter,
  savingsIds: ReadonlySet<string>
): Row[] {
  const timeZone = filter.timeZone ?? APP_TIME_ZONE;
  const type = filter.type ?? "all";
  const from = filter.fromDay ? parseDayKey(filter.fromDay) : null;
  const to = filter.toDay ? parseDayKey(filter.toDay) : null;
  const startMs = from ? zonedDayRange(from, timeZone).start.getTime() : null;
  // Exclusive end = start of the day after `to`, so the last day counts in full.
  const endMs = to ? zonedDayRange(to, timeZone).end.getTime() : null;

  return rows.filter((row) => {
    if (type !== "all" && classifyFlow(row, savingsIds) !== type) return false;
    if (filter.categoryId && row.categoryId !== filter.categoryId) return false;
    if (startMs !== null || endMs !== null) {
      const ms = toMs(row.occurredAt);
      if (startMs !== null && ms < startMs) return false;
      if (endMs !== null && ms >= endMs) return false;
    }
    return true;
  });
}

export type ListTotals = FlowTotals & { count: number };

export function listTotals(rows: readonly ListRow[], savingsIds: ReadonlySet<string>): ListTotals {
  return { count: rows.length, ...sumFlows(rows, savingsIds) };
}

/** `fromDay`/`toDay` spanning exactly the calendar month. */
export function monthDayRange(ref: MonthRef): { fromDay: string; toDay: string } {
  const prefix = `${String(ref.year).padStart(4, "0")}-${String(ref.month).padStart(2, "0")}`;
  return { fromDay: `${prefix}-01`, toDay: `${prefix}-${String(daysInMonth(ref.year, ref.month)).padStart(2, "0")}` };
}

/** The month a `fromDay`/`toDay` pair spans exactly, or null if it is any other range. */
export function monthOfDayRange(fromDay?: string | null, toDay?: string | null): MonthRef | null {
  const from = fromDay ? parseDayKey(fromDay) : null;
  const to = toDay ? parseDayKey(toDay) : null;
  if (!from || !to) return null;
  if (from.year !== to.year || from.month !== to.month) return null;
  if (from.day !== 1 || to.day !== daysInMonth(to.year, to.month)) return null;
  return { year: from.year, month: from.month };
}

/** Distinct calendar months that contain at least one row, newest first. */
export function monthsWithTransactions(
  rows: readonly { occurredAt: string | Date }[],
  timeZone: string = APP_TIME_ZONE
): MonthRef[] {
  const seen = new Map<number, MonthRef>();
  for (const row of rows) {
    const date = typeof row.occurredAt === "string" ? new Date(row.occurredAt) : row.occurredAt;
    if (Number.isNaN(date.getTime())) continue;
    const ref = zonedMonth(date, timeZone);
    seen.set(ref.year * 12 + ref.month, ref);
  }
  return [...seen.entries()].sort((a, b) => b[0] - a[0]).map(([, ref]) => ref);
}
