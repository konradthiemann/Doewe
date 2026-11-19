/**
 * Calendar arithmetic in the app's time zone — no Prisma, no I/O.
 *
 * Rule: a transaction belongs to the calendar day and month of its
 * `occurredAt` in APP_TIME_ZONE. Server and browser must both bucket with
 * these helpers. `new Date(year, month, 1)`, `getMonth()` and friends use the
 * time zone of whatever process runs them — UTC in production, the device
 * setting in the browser — so the same booking would land in different months
 * depending on who looks (a purchase at 00:30 on the 1st is still the last
 * day of the previous month in UTC).
 */
import type { CalendarDate, MonthRef } from "./recurringSchedule";

export const APP_TIME_ZONE = "Europe/Berlin";

export type ZonedDateTime = CalendarDate & { hour: number; minute: number; second: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock parts of the instant `date` in `timeZone`. */
export function zonedDateTime(date: Date, timeZone: string = APP_TIME_ZONE): ZonedDateTime {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // Some engines report midnight as 24 despite hourCycle h23.
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

/** Calendar day of the instant `date` in `timeZone`. */
export function zonedDate(date: Date, timeZone: string = APP_TIME_ZONE): CalendarDate {
  const { year, month, day } = zonedDateTime(date, timeZone);
  return { year, month, day };
}

/** Calendar month of the instant `date` in `timeZone`. */
export function zonedMonth(date: Date, timeZone: string = APP_TIME_ZONE): MonthRef {
  const { year, month } = zonedDateTime(date, timeZone);
  return { year, month };
}

/** `yyyy-mm-dd` of the instant `date` in `timeZone` (the value of an `<input type="date">`). */
export function zonedDayKey(date: Date, timeZone: string = APP_TIME_ZONE): string {
  const { year, month, day } = zonedDateTime(date, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Milliseconds `timeZone` is ahead of UTC at the instant `utcMs`. */
function offsetMs(utcMs: number, timeZone: string): number {
  const wholeSecond = Math.floor(utcMs / 1000) * 1000;
  const p = zonedDateTime(new Date(wholeSecond), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - wholeSecond;
}

/**
 * The instant at which the wall clock in `timeZone` shows the given date and
 * time. Month and day may overflow (month 13 is January of the next year, day
 * 0 the last day of the previous month), like `Date.UTC`. A wall-clock time
 * skipped by a daylight-saving jump resolves to the instant after the jump.
 */
export function zonedTimeToUtc(
  local: CalendarDate & { hour?: number; minute?: number; second?: number },
  timeZone: string = APP_TIME_ZONE
): Date {
  const wallAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour ?? 0,
    local.minute ?? 0,
    local.second ?? 0
  );
  // The offset depends on the instant we are looking for: estimate with the
  // offset at the wall time read as UTC, then correct with the offset at that
  // estimate (differs only within hours of a daylight-saving change).
  const estimate = wallAsUtc - offsetMs(wallAsUtc, timeZone);
  return new Date(wallAsUtc - offsetMs(estimate, timeZone));
}

/** Half-open range `[start, end)` covering one calendar day in `timeZone`. */
export function zonedDayRange(day: CalendarDate, timeZone: string = APP_TIME_ZONE): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(day, timeZone),
    end: zonedTimeToUtc({ ...day, day: day.day + 1 }, timeZone)
  };
}

/** Half-open range `[start, end)` covering the calendar month (`month` 1–12, may overflow) in `timeZone`. */
export function zonedMonthRange(
  year: number,
  month: number,
  timeZone: string = APP_TIME_ZONE
): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc({ year, month, day: 1 }, timeZone),
    end: zonedTimeToUtc({ year, month: month + 1, day: 1 }, timeZone)
  };
}

/** Half-open range `[start, end)` covering the calendar year in `timeZone`. */
export function zonedYearRange(year: number, timeZone: string = APP_TIME_ZONE): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc({ year, month: 1, day: 1 }, timeZone),
    end: zonedTimeToUtc({ year: year + 1, month: 1, day: 1 }, timeZone)
  };
}

/** Number of days in the calendar month (`month` 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The month `delta` months away from `ref` (negative = earlier). */
export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const absolute = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(absolute / 12), month: (((absolute % 12) + 12) % 12) + 1 };
}

/** `yyyy-mm` key of a calendar month, e.g. the period a recurring occurrence was booked for. */
export function monthKey(ref: MonthRef): string {
  return `${String(ref.year).padStart(4, "0")}-${String(ref.month).padStart(2, "0")}`;
}

/** Parses the `yyyy-mm-dd` of an `<input type="date">`; null if it is not a real calendar day. */
export function parseDayKey(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}
