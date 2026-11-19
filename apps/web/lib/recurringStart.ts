/**
 * Start date and day of month of a standing order — no React, no I/O.
 *
 * Everything works on calendar values (`yyyy-mm-dd` day keys, year/month/day)
 * of the app's time zone; the caller supplies "today" (`zonedDate(new Date())`).
 */
import { daysInMonth, dueMonthsBetween, parseDayKey, shiftMonth, type CalendarDate, type MonthRef } from "@doewe/shared";

/** The server rejects a start date further than this from today, in either direction. */
export const START_DATE_MAX_YEARS = 10;

function dayKey(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** Same day `years` years away; 29 February becomes the 28th in a common year. */
function shiftYears(date: CalendarDate, years: number): CalendarDate {
  const year = date.year + years;
  return { year, month: date.month, day: Math.min(date.day, daysInMonth(year, date.month)) };
}

/** Earliest and latest allowed start date (`yyyy-mm-dd`), for the `min`/`max` of the date field. */
export function startDateBounds(today: CalendarDate): { min: string; max: string } {
  return {
    min: dayKey(shiftYears(today, -START_DATE_MAX_YEARS)),
    max: dayKey(shiftYears(today, START_DATE_MAX_YEARS))
  };
}

/** Whether `startDate` is a real calendar day within the allowed range around today. */
export function isStartDateInRange(startDate: string, today: CalendarDate): boolean {
  if (!parseDayKey(startDate)) return false;
  const { min, max } = startDateBounds(today);
  return startDate >= min && startDate <= max;
}

/** Day of month of a start date; null if it is not a calendar day. */
export function dayOfStartDate(startDate: string): number | null {
  return parseDayKey(startDate)?.day ?? null;
}

/**
 * The start date moved to `day` within its own month, clamped to the length of
 * that month (31 → 30 in November). Returned unchanged if the start date or
 * the day is not usable.
 */
export function moveStartDateToDay(startDate: string, day: number): string {
  const date = parseDayKey(startDate);
  if (!date || !Number.isInteger(day) || day < 1 || day > 31) return startDate;
  return dayKey({ year: date.year, month: date.month, day: Math.min(day, daysInMonth(date.year, date.month)) });
}

/**
 * How many bookings "book past months" would create: the due months from the
 * start month up to and including last month. 0 when the start date lies in
 * the current month or later (or is not a calendar day).
 */
export function backfillMonthCount(startDate: string, intervalMonths: number, currentMonth: MonthRef): number {
  const start = parseDayKey(startDate);
  if (!start) return 0;
  const lastMonth = shiftMonth(currentMonth, -1);
  return dueMonthsBetween({
    nextYear: start.year,
    nextMonth: start.month,
    intervalMonths: Number.isInteger(intervalMonths) && intervalMonths > 0 ? intervalMonths : 1,
    untilYear: lastMonth.year,
    untilMonth: lastMonth.month
  }).length;
}
