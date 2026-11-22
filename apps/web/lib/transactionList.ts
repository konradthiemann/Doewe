/**
 * Pure helpers of the transaction list page — no React, no I/O.
 *
 * Type, category and date filtering and the totals live in `@doewe/shared`
 * (`filterTransactions`, `listTotals`) because the analytics routes have to
 * agree with them. What is here is only needed by the page itself: the text
 * search, the month picker, the totals bar and the schedule of recurring
 * templates. Calendar questions are answered in `APP_TIME_ZONE`.
 */
import {
  daysInMonth,
  isRecurringDueInMonth,
  monthKey,
  monthOfDayRange,
  parseDayKey,
  shiftMonth,
  zonedMonth,
  type CalendarDate,
  type FlowTotals,
  type MonthRef
} from "@doewe/shared";

import type { Locale } from "./locales/translate";

function groupThousands(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Every way an amount may be typed into the search field, from integer cents:
 * the plain decimal form (`-1234.56`), and the form of the UI locale with and
 * without thousands separators (de: `-1.234,56`, `-1234,56`; en: `-1,234.56`).
 * A query without sign matches too, because it is a substring of these.
 */
export function amountSearchForms(amountCents: number, locale: Locale): string[] {
  const sign = amountCents < 0 ? "-" : "";
  const abs = Math.abs(amountCents);
  const euros = String(Math.trunc(abs / 100));
  const fraction = String(abs % 100).padStart(2, "0");
  const [group, decimal] = locale === "de" ? [".", ","] : [",", "."];
  return [
    ...new Set([
      `${sign}${euros}.${fraction}`,
      `${sign}${euros}${decimal}${fraction}`,
      `${sign}${groupThousands(euros, group)}${decimal}${fraction}`
    ])
  ];
}

/** Whether any of `fields` contains the query (case-insensitive); an empty query matches everything. */
export function matchesSearch(fields: ReadonlyArray<string | null | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(needle));
}

/** Which figures the totals bar above the list shows. */
export type TotalsBarParts = { income: boolean; outcome: boolean; savings: boolean; net: boolean };

/**
 * Income, outcome and savings are shown when they are non-zero (savings is a
 * net amount and may be negative); the net is only informative when more than
 * one of them is on screen.
 */
export function totalsBarParts(totals: FlowTotals): TotalsBarParts {
  const income = totals.incomeCents !== 0;
  const outcome = totals.outcomeCents !== 0;
  const savings = totals.savingsCents !== 0;
  return { income, outcome, savings, net: [income, outcome, savings].filter(Boolean).length > 1 };
}

/**
 * File name of the CSV export for the list's date range: `<base>-2026-11.csv`
 * for exactly one calendar month, `<base>-2026-11-01_2026-11-22.csv` for any
 * other range, `<base>.csv` without one. The days come from the URL, so only
 * valid `yyyy-mm-dd` keys make it into the name.
 */
export function transactionsCsvFileName(base: string, fromDay?: string | null, toDay?: string | null): string {
  const month = monthOfDayRange(fromDay, toDay);
  if (month) return `${base}-${monthKey(month)}.csv`;
  const days = [fromDay, toDay].filter((day): day is string => Boolean(day && parseDayKey(day)));
  return days.length > 0 ? `${base}-${days.join("_")}.csv` : `${base}.csv`;
}

/**
 * Months offered by the month picker, newest first: the months that contain
 * bookings plus the currently selected one (a month reached through a link or
 * the date fields may be empty, the picker still has to be able to show it).
 */
export function monthPickerOptions(monthsWithBookings: readonly MonthRef[], selected: MonthRef | null): MonthRef[] {
  const byKey = new Map<string, MonthRef>();
  for (const ref of monthsWithBookings) byKey.set(monthKey(ref), ref);
  if (selected) byKey.set(monthKey(selected), selected);
  return [...byKey.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
}

/** The part of a recurring template that decides when it is due. */
export type RecurringSchedule = {
  /** Anchor: the first occurrence. Only its month (in the app's time zone) matters. */
  nextOccurrence: string | Date;
  intervalMonths?: number | null;
  dayOfMonth?: number | null;
};

function intervalOf(schedule: RecurringSchedule): number {
  const interval = schedule.intervalMonths ?? 1;
  return Number.isInteger(interval) && interval > 0 ? interval : 1;
}

/** Calendar month of the anchor in the app's time zone. */
export function recurringAnchorMonth(schedule: RecurringSchedule): MonthRef {
  const anchor = typeof schedule.nextOccurrence === "string" ? new Date(schedule.nextOccurrence) : schedule.nextOccurrence;
  return zonedMonth(anchor);
}

/** Whether the template is due in the given month — the same rule the server books and projects with. */
export function isRecurringDueIn(schedule: RecurringSchedule, ref: MonthRef): boolean {
  const anchor = recurringAnchorMonth(schedule);
  return isRecurringDueInMonth({
    nextYear: anchor.year,
    nextMonth: anchor.month,
    intervalMonths: intervalOf(schedule),
    year: ref.year,
    month: ref.month
  });
}

/**
 * The next day on or after `today` on which the template is due: the first
 * month of its rhythm (anchor month + n × interval) whose due day has not
 * passed. The due day is `dayOfMonth`, clamped to the length of the month
 * (31 → 28/29 in February). The anchor itself never advances, so it cannot be
 * shown as "next" once the first occurrence has passed.
 */
export function nextDueDate(schedule: RecurringSchedule, today: CalendarDate): CalendarDate {
  const anchor = recurringAnchorMonth(schedule);
  const interval = intervalOf(schedule);
  const requestedDay = schedule.dayOfMonth ?? 1;
  const dayIn = (ref: MonthRef) => Math.min(Math.max(requestedDay, 1), daysInMonth(ref.year, ref.month));

  const monthsSinceAnchor = (today.year - anchor.year) * 12 + (today.month - anchor.month);
  let steps = monthsSinceAnchor <= 0 ? 0 : Math.ceil(monthsSinceAnchor / interval);
  let due = shiftMonth(anchor, steps * interval);
  // Due in the current month, but the day is already behind us → one rhythm step further.
  if (due.year === today.year && due.month === today.month && dayIn(due) < today.day) {
    steps += 1;
    due = shiftMonth(anchor, steps * interval);
  }
  return { year: due.year, month: due.month, day: dayIn(due) };
}
