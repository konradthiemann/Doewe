import { parseDayKey, zonedTimeToUtc } from "@doewe/shared";
import { z } from "zod";

// Eingaben, die erst in der Datenbank scheitern, kämen als 500 zurück. Die
// Offline-Outbox hält bei jedem 5xx an (packages/shared/src/outbox.ts) und
// würde dann alle späteren Buchungen für immer blockieren. Alles, was sich
// nicht speichern lässt, wird deshalb hier als 400 abgewiesen.

// Grenzen der Postgres-Spalte `Int` (int4).
export const INT4_MIN = -2_147_483_648;
export const INT4_MAX = 2_147_483_647;

// Zeitpunkte nach dem Jahr 9999 kann Prisma nicht übergeben (z. B. ein
// Tippfehler wie Jahr 20261 im Datumsfeld). Vor 1900 ist immer ein Tippfehler
// (0026 statt 2026) — und zweistellige Jahre deutet JavaScript als 19xx um.
const MIN_YEAR = 1900;
const MIN_INSTANT_MS = Date.UTC(MIN_YEAR, 0, 1);
const MAX_INSTANT_MS = Date.parse("9999-12-31T23:59:59.999Z");

// ISO-Zeitpunkt, mit oder ohne Zeitzone. Mit Zone (`Z`, `±hh:mm`) ist er
// eindeutig. Ohne Zone läse `new Date()` ihn in der Zeitzone des Prozesses — in
// Produktion (UTC) eine andere Stunde als auf einem Entwicklerrechner; er gilt
// deshalb als Berliner Uhrzeit, wie ein reiner Kalendertag.
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/;

const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Text, den Postgres speichern kann: kein NUL-Zeichen, kein halbes Surrogat-Paar. */
export function isStorableText(value: string): boolean {
  return !value.includes("\u0000") && !UNPAIRED_SURROGATE.test(value);
}

/**
 * Zeitpunkt einer Buchung aus dem Request. Ein reiner Kalendertag
 * (`yyyy-mm-dd`) wird als 12:00 Uhr Berliner Zeit dieses Tages gelesen
 * (docs/calculations/00-grundregeln.md §1). Sonst muss es ein ISO-Zeitpunkt
 * sein (`2026-11-19T10:00:00.000Z`); ohne Zeitzone gilt er als Berliner Uhrzeit.
 * `null`, wenn der Wert kein gültiges, speicherbares Datum ist.
 */
export function parseOccurredAt(value: string | Date): Date | null {
  let date: Date;
  if (typeof value !== "string") {
    date = value;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = parseDayKey(value);
    if (!day || day.year < MIN_YEAR) return null;
    date = zonedTimeToUtc({ ...day, hour: 12 });
  } else {
    const match = ISO_DATE_TIME.exec(value);
    if (!match) return null;
    if (match[7]) {
      date = new Date(value);
    } else {
      const day = parseDayKey(value.slice(0, 10));
      const [hour, minute, second] = [Number(match[4]), Number(match[5]), Number(match[6] ?? 0)];
      if (!day || day.year < MIN_YEAR || hour > 23 || minute > 59 || second > 59) return null;
      date = zonedTimeToUtc({ ...day, hour, minute, second });
    }
  }
  const ms = date.getTime();
  return Number.isNaN(ms) || ms < MIN_INSTANT_MS || ms > MAX_INSTANT_MS ? null : date;
}

export const TransactionInput = z.object({
  // Optional: vom Client vergebene ID (cuid2) für die Offline-Erfassung —
  // die optimistische Zeile und die Server-Zeile tragen so dieselbe ID.
  id: z.string().cuid2().optional(),
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  savingGoalId: z.string().min(1).optional(),
  amountCents: z.number().int().min(INT4_MIN).max(INT4_MAX),
  // trim().min(1) statt eines werfenden Transforms: eine Beschreibung nur aus
  // Leerraum muss ein 400 sein (ein Fehler im Transform fliegt aus safeParse
  // heraus und wird zum 500).
  description: z.string().trim().min(1).refine(isStorableText, { message: "Contains characters that cannot be stored" }),
  occurredAt: z
    .union([z.string(), z.date()])
    .refine((value) => parseOccurredAt(value) !== null, { message: "Invalid date" }),
  taxRelevant: z.boolean().optional()
});
