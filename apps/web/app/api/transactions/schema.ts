import { parseDayKey, zonedTimeToUtc } from "@doewe/shared";
import { z } from "zod";

// Eingaben, die erst in der Datenbank scheitern, kämen als 500 zurück. Die
// Offline-Outbox hält bei jedem 5xx an (packages/shared/src/outbox.ts) und
// würde dann alle späteren Buchungen für immer blockieren. Alles, was sich
// nicht speichern lässt, wird deshalb hier als 400 abgewiesen.

// Grenzen der Postgres-Spalte `Int` (int4).
export const INT4_MIN = -2_147_483_648;
export const INT4_MAX = 2_147_483_647;

// Zeitpunkte außerhalb der Jahre 0000–9999 kann Prisma nicht übergeben
// (z. B. ein Tippfehler wie Jahr 20261 im Datumsfeld).
const MIN_INSTANT_MS = Date.parse("0000-01-01T00:00:00.000Z");
const MAX_INSTANT_MS = Date.parse("9999-12-31T23:59:59.999Z");

const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Text, den Postgres speichern kann: kein NUL-Zeichen, kein halbes Surrogat-Paar. */
export function isStorableText(value: string): boolean {
  return !value.includes("\u0000") && !UNPAIRED_SURROGATE.test(value);
}

/**
 * Zeitpunkt einer Buchung aus dem Request. Ein reiner Kalendertag
 * (`yyyy-mm-dd`) wird als 12:00 Uhr Berliner Zeit dieses Tages gelesen
 * (docs/calculations/00-grundregeln.md §1), alles andere als ISO-Zeitpunkt.
 * `null`, wenn der Wert kein gültiges, speicherbares Datum ist.
 */
export function parseOccurredAt(value: string | Date): Date | null {
  let date: Date;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = parseDayKey(value);
    if (!day) return null;
    date = zonedTimeToUtc({ ...day, hour: 12 });
  } else {
    date = typeof value === "string" ? new Date(value) : value;
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
