/**
 * Helfer für die Umwandlung zwischen einem nativen `<input type="date">`
 * (liefert/erwartet `yyyy-mm-dd`) und dem ISO-Timestamp, den die
 * Transaktions-API speichert.
 *
 * Der Kalendertag ist immer der Tag in `APP_TIME_ZONE` (Europe/Berlin), nicht
 * der Tag in der Zeitzone des Geräts: eine Buchung zählt überall an dem Tag,
 * den dieses Feld zeigt (siehe docs/calculations/00-grundregeln.md §1).
 */
import { monthDayRange, zonedDayKey, zonedMonth, zonedTimeToUtc, type MonthRef } from "@doewe/shared";

/** Formatiert einen Zeitpunkt als `yyyy-mm-dd` seines Berliner Kalendertags für ein <input type="date">. */
export function toDateInputValue(date: Date): string {
  return zonedDayKey(date);
}

/**
 * Wandelt das `yyyy-mm-dd` aus dem Datumsfeld in einen ISO-Timestamp für die API.
 *
 * Bleibt der gewählte Tag der Berliner Kalendertag von `preserveIfSameDay` (im
 * Create der aktuelle Zeitpunkt, im Edit das Original-`occurredAt`), wird
 * dieser exakte Timestamp beibehalten — so behält eine unveränderte Buchung
 * ihre Uhrzeit und eine neue Buchung von heute den echten Zeitpunkt. Bei einem
 * anderen Tag wird 12:00 Uhr Berliner Zeit dieses Tages geschrieben: Mittag
 * ist in Berlin und in UTC derselbe Kalendertag.
 */
export function dateInputToISO(dateStr: string, preserveIfSameDay: Date): string {
  if (zonedDayKey(preserveIfSameDay) === dateStr) {
    return preserveIfSameDay.toISOString();
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  return zonedTimeToUtc({ year, month, day, hour: 12 }).toISOString();
}

/**
 * Parst das `yyyy-mm` eines `<input type="month">` bzw. einer Monatsauswahl
 * (Gegenstück zu `monthKey`); `null` für alles andere.
 */
export function parseMonthKey(value: string): MonthRef | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** `yyyy-mm-dd` des ersten Tags des laufenden Berliner Monats (z.B. als Startdatum eines Dauerauftrags). */
export function firstDayOfCurrentMonth(now: Date = new Date()): string {
  return monthDayRange(zonedMonth(now)).fromDay;
}
