/**
 * Display of booking dates and month labels — no React, no I/O.
 *
 * A booking is counted on the calendar day its `occurredAt` has in
 * `APP_TIME_ZONE` (docs/calculations/00-grundregeln.md §1). The lists have to
 * show that day, not the day in the device's time zone: a phone set to another
 * zone would otherwise print "31.10." next to a booking that every total
 * counts in November.
 */
import { APP_TIME_ZONE, zonedDateTime, type CalendarDate, type MonthRef } from "@doewe/shared";

import type { Locale } from "./locales/translate";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** Short numeric date of a calendar day: `09.11.2026` (de) / `11/09/2026` (en). */
export function formatCalendarDate(day: CalendarDate, locale: Locale): string {
  const year = String(day.year).padStart(4, "0");
  return locale === "de"
    ? `${pad(day.day)}.${pad(day.month)}.${year}`
    : `${pad(day.month)}/${pad(day.day)}/${year}`;
}

/** Short numeric date of the day a booking is counted on; empty for an invalid timestamp. */
export function formatBookingDate(value: string | Date, locale: Locale): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatCalendarDate(zonedDateTime(date), locale);
}

/**
 * Date and wall-clock time of a booking in the app's time zone:
 * `09.11.2026 14:05` (de) / `11/09/2026, 2:05 PM` (en). Empty for an invalid timestamp.
 */
export function formatBookingDateTime(value: string | Date, locale: Locale): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = zonedDateTime(date);
  const day = formatCalendarDate(parts, locale);
  if (locale === "de") return `${day} ${pad(parts.hour)}:${pad(parts.minute)}`;
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return `${day}, ${hour12}:${pad(parts.minute)} ${parts.hour < 12 ? "AM" : "PM"}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(dateLocale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${dateLocale}|${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(dateLocale, { ...options, timeZone });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Day and month of the day a booking (or a goal's completion) is counted on,
 * e.g. `9. Nov.`, `9. November` or `9. November 2026` — `dateLocale` is a
 * BCP 47 tag (`de-DE`, `en-US`). Empty for an invalid timestamp.
 */
export function formatBookingDayMonth(
  value: string | Date,
  dateLocale: string,
  options: { month?: "short" | "long"; year?: boolean } = {}
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const { month = "short", year = false } = options;
  const formatOptions: Intl.DateTimeFormatOptions = year
    ? { day: "numeric", month, year: "numeric" }
    : { day: "numeric", month };
  return formatterFor(dateLocale, APP_TIME_ZONE, formatOptions).format(date);
}

/**
 * Name of a calendar month, e.g. `Oktober 2026` (`month: "long", year: true`,
 * the default), `Okt. 2026` or just `Okt`. A month has no time zone: the label
 * is derived from the middle of the month in UTC and formatted in UTC.
 */
export function formatMonth(
  ref: MonthRef,
  dateLocale: string,
  options: { month?: "short" | "long"; year?: boolean } = {}
): string {
  const { month = "long", year = true } = options;
  const formatOptions: Intl.DateTimeFormatOptions = year ? { month, year: "numeric" } : { month };
  return formatterFor(dateLocale, "UTC", formatOptions).format(new Date(Date.UTC(ref.year, ref.month - 1, 15)));
}
