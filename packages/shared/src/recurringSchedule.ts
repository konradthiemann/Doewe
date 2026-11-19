/**
 * Pure recurring-transaction due-date logic — no Prisma, no I/O.
 *
 * A RecurringTransaction has an anchor month (`nextOccurrence`, split by the
 * caller into nextYear/nextMonth) and repeats every `intervalMonths` months
 * from there. This was previously duplicated between the analytics summary
 * endpoint and the budget-alert check; both now share this module.
 *
 * Everything here works on calendar values (year, month, day), never on
 * instants. The caller reads them in the app's time zone (`zonedMonth`,
 * `zonedDate` from ./calendar) and turns a calendar day back into an instant
 * with `zonedTimeToUtc({ ...day, hour: 12 })`.
 */
import { daysInMonth, shiftMonth } from "./calendar";

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

export type CalendarDate = { year: number; month: number; day: number }; // month 1-12

/**
 * Adds `months` calendar months to `date`. The day is `dayOfMonth` (1-31) if
 * given, else the date's own day, and is clamped to the length of the target
 * month (Jan 31 + 1 month -> Feb 28/29).
 */
export function addMonthsClamped(date: CalendarDate, months: number, dayOfMonth?: number): CalendarDate {
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`months must be an integer >= 0, got ${months}`);
  }
  if (dayOfMonth !== undefined && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) {
    throw new RangeError(`dayOfMonth must be an integer in 1..31, got ${dayOfMonth}`);
  }
  const absoluteMonth = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(dayOfMonth ?? date.day, daysInMonth) };
}

/**
 * The calendar day on which a recurring transaction with `dayOfMonth` falls in
 * the given month: the day is clamped to the length of the month (31 -> 30 in
 * November, 28/29 in February).
 */
export function occurrenceDate(ref: MonthRef, dayOfMonth: number): CalendarDate {
  return { year: ref.year, month: ref.month, day: Math.min(dayOfMonth, daysInMonth(ref.year, ref.month)) };
}

/**
 * Whether the calendar day `date` is `other` or an earlier day. An occurrence
 * is due when its day is on or before today — compare days, not instants: an
 * occurrence is dated at noon, so an instant comparison would delay the
 * booking until the afternoon of its day.
 */
export function isOnOrBeforeDate(date: CalendarDate, other: CalendarDate): boolean {
  if (date.year !== other.year) return date.year < other.year;
  if (date.month !== other.month) return date.month < other.month;
  return date.day <= other.day;
}

/**
 * First occurrence of a recurring transaction created `today` without an
 * explicit start date: this month if its (clamped) day is today or still
 * ahead, otherwise next month. The decision uses the clamped day, so on
 * 30 November both day 30 and day 31 are due today.
 */
export function firstOccurrenceFrom(today: CalendarDate, dayOfMonth: number): CalendarDate {
  const thisMonth = occurrenceDate(today, dayOfMonth);
  if (thisMonth.day >= today.day) return thisMonth;
  return occurrenceDate(shiftMonth(today, 1), dayOfMonth);
}
