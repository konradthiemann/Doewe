/**
 * Materialisiert fällige Daueraufträge als echte Transaktionen.
 *
 * Ohne dies bleiben RecurringTransaction-Zeilen reine Vorlagen (siehe
 * docs/calculations/03-wiederkehrende-transaktionen.md) — der Übertrag
 * (carryoverFromLastMonth) zählt nur echte Buchungen, verliert also jeden
 * fälligen Dauerauftrag für immer, der nie manuell nachgebucht wird.
 *
 * `dueMonthsBetween` liefert für jeden Dauerauftrag jeden fälligen Monat vom
 * Anker (`nextOccurrence`) bis zum Referenzmonat — dieselbe Funktion deckt
 * damit sowohl den laufenden Cron-Lauf (nur der aktuelle Monat ist neu) als
 * auch ein Nachbuchen der Vergangenheit ab (alle bisher verpassten Monate
 * werden im selben Lauf erkannt und gebucht).
 *
 * Untergrenze `bookFromPeriod` ("JJJJ-MM", Europe/Berlin): Vorkommen, deren
 * Periode davor liegt, werden nie automatisch gebucht. Ein Dauerauftrag mit
 * Startdatum in der Vergangenheit, "Dauerauftrag aus Buchung" und ein
 * geänderter Rhythmus setzen sie auf den laufenden Monat, damit die Monate
 * davor nicht ungefragt nachgebucht werden (siehe die jeweilige Route). `null`
 * = keine Untergrenze (alle Daueraufträge von vor dieser Spalte).
 *
 * Vorkommen = (Dauerauftrag, Periode). Die Periode ist der Monat ("JJJJ-MM",
 * Europe/Berlin), FÜR den gebucht wird; sie steht als `recurringPeriod` auf
 * der Buchung. Idempotent: ein Monat gilt als gebucht, sobald eine Transaction
 * mit dieser `recurringTransactionId` und dieser Periode existiert — auch eine
 * gelöschte (Tombstone). Der Monat von `occurredAt` spielt keine Rolle mehr:
 * Verschiebt der Nutzer die Buchung in einen anderen Monat oder löscht sie,
 * bleibt die Periode belegt und wird nicht erneut gebucht (siehe
 * lib/recurringPeriods.ts; Altzeilen ohne Periode zählen für den Berliner
 * Monat ihres Datums). Soll ein Monat entfallen, bevor er gebucht ist, ist
 * "Überspringen" (Skip) der Weg.
 *
 * Kalender (docs/calculations/00-grundregeln.md §1): Anker-Monat, "heute" und
 * Fälligkeit sind Berliner Kalenderwerte. Fällig ist ein Vorkommen, sobald der
 * Berliner Kalendertag von `now` den Fälligkeitstag (`dayOfMonth`, auf die
 * Monatslänge begrenzt) erreicht hat; gebucht wird auf 12:00 Uhr Berliner Zeit
 * dieses Tages. Die Buchung erbt die Steuer-Markierung ihrer Kategorie, wie
 * eine von Hand angelegte.
 *
 * Von Hand erfasste Zahlung: Bevor ein Vorkommen gebucht wird, sucht der Lauf
 * unter dem Lock eine von Hand angelegte Buchung, die für dieses Vorkommen
 * steht (`pickAdoptionCandidate` in @doewe/shared: gleiches Konto, gleicher
 * Betrag, gleiche Kategorie bzw. ohne Kategorie gleiche Beschreibung, höchstens
 * 7 Kalendertage vor oder nach dem Fälligkeitstag, nicht gelöscht, mit keinem
 * Dauerauftrag verknüpft). Gibt es eine, wird sie übernommen: sie bekommt
 * `recurringTransactionId` und `recurringPeriod`, sonst ändert sich nichts an
 * ihr, und es wird nichts gebucht. Jede Buchung steht nur für ein Vorkommen.
 * `adoptManualBookingsForCurrentMonth` übernimmt auf dieselbe Weise für die
 * Vorkommen des laufenden Monats, auch wenn ihr Tag noch nicht erreicht ist,
 * und legt nie etwas an — sonst zählte das Dashboard die Zahlung bis zum
 * Fälligkeitstag einmal als gebucht und einmal als geplant.
 */
import {
  ADOPTION_WINDOW_DAYS,
  dueMonthsBetween,
  isBeforeBookFromPeriod,
  isOnOrBeforeDate,
  isRecurringDueInMonth,
  monthKey,
  occurrenceDate,
  pickAdoptionCandidate,
  shiftMonth,
  zonedDate,
  zonedMonth,
  zonedTimeToUtc,
  type AdoptionRow,
  type CalendarDate,
  type MonthRef,
  type RecurringAnchor
} from "@doewe/shared";

import { DEMO_ACCOUNT_ID } from "./demoConstants";
import { prisma } from "./prisma";
import { loadBookedOccurrenceKeys, occurrenceKey } from "./recurringPeriods";

import type { Prisma } from "@prisma/client";

export type BookedOccurrence = {
  recurringId: string;
  accountId: string;
  /**
   * The booking that now stands for the occurrence: the created one, or the
   * hand-entered one that was adopted. null when dryRun — nothing was written.
   */
  transactionId: string | null;
  year: number;
  month: number;
  amountCents: number;
  description: string;
  /**
   * true: nothing was created — an existing hand-entered booking was linked
   * to the occurrence (in a dry run: would be linked).
   */
  adopted: boolean;
};

type DueRecurring = {
  id: string;
  accountId: string;
  categoryId: string | null;
  amountCents: number;
  description: string;
  taxRelevant: boolean;
};

/** An occurrence that is neither booked nor skipped nor before `bookFromPeriod`. */
type OpenOccurrence = { rec: DueRecurring; dueDay: CalendarDate };

type RunScope = { householdId?: string };

const ADOPTION_ROW_SELECT = {
  id: true,
  accountId: true,
  categoryId: true,
  amountCents: true,
  description: true,
  occurredAt: true,
  createdAt: true
} as const;

/** Books every occurrence that is due on the Berlin calendar day of `now`. */
export async function materializeDueRecurringTransactions(
  now: Date = new Date(),
  options: { dryRun?: boolean; householdId?: string } = {}
): Promise<BookedOccurrence[]> {
  return bookOccurrencesDueBy(zonedDate(now), options);
}

/** Books every open occurrence whose due day is `today` or earlier. */
async function bookOccurrencesDueBy(
  today: CalendarDate,
  options: { dryRun?: boolean; householdId?: string }
): Promise<BookedOccurrence[]> {
  const open = await loadOpenOccurrences(
    options,
    (schedule) => dueMonthsBetween({ ...schedule, untilYear: today.year, untilMonth: today.month }),
    // Don't book an occurrence whose day hasn't arrived yet this month.
    (dueDay) => isOnOrBeforeDate(dueDay, today)
  );
  return settleOccurrences(open, { create: true, dryRun: options.dryRun ?? false });
}

/**
 * Loads the templates in scope and lists their open occurrences: the months
 * `monthsOf` returns for a template's schedule, minus those whose due day
 * `includeDay` rejects, that lie before `bookFromPeriod`, are skipped or are
 * already booked.
 */
async function loadOpenOccurrences(
  scope: RunScope,
  monthsOf: (schedule: RecurringAnchor) => MonthRef[],
  includeDay: (dueDay: CalendarDate) => boolean
): Promise<OpenOccurrence[]> {
  const recurringTransactions = await prisma.recurringTransaction.findMany({
    // The public demo account is reseeded by /api/demo/seed and must never
    // receive real bookings — same exclusion as admin/usage/route.ts.
    where: {
      deletedAt: null,
      accountId: { not: DEMO_ACCOUNT_ID },
      ...(scope.householdId ? { account: { householdId: scope.householdId } } : {})
    },
    select: {
      id: true,
      accountId: true,
      categoryId: true,
      amountCents: true,
      description: true,
      intervalMonths: true,
      dayOfMonth: true,
      nextOccurrence: true,
      bookFromPeriod: true,
      // Nested reads bypass the soft-delete filter: a deleted category must
      // not pass its tax flag on (a manual booking could not use it either).
      category: { select: { isTaxRelevant: true, deletedAt: true } }
    }
  });

  // Prefetch skips and already-booked periods in a few queries instead of one
  // round trip per recurring x month — this runs on every dashboard load
  // (catchUpPastRecurringForHousehold, adoptManualBookingsForCurrentMonth), so
  // the steady state must stay cheap.
  const recurringIds = recurringTransactions.map((r) => r.id);
  const [skipRows, alreadyBooked] = await Promise.all([
    prisma.recurringTransactionSkip.findMany({
      where: { recurringId: { in: recurringIds } },
      select: { recurringId: true, year: true, month: true }
    }),
    loadBookedOccurrenceKeys(recurringIds)
  ]);
  const skipped = new Set(skipRows.map((s) => occurrenceKey(s.recurringId, s)));

  const open: OpenOccurrence[] = [];
  for (const rec of recurringTransactions) {
    const anchor = zonedMonth(rec.nextOccurrence);
    const months = monthsOf({ nextYear: anchor.year, nextMonth: anchor.month, intervalMonths: rec.intervalMonths });
    const due: DueRecurring = {
      id: rec.id,
      accountId: rec.accountId,
      categoryId: rec.categoryId,
      amountCents: rec.amountCents,
      description: rec.description,
      taxRelevant: rec.category !== null && rec.category.deletedAt === null && rec.category.isTaxRelevant
    };

    for (const ref of months) {
      // A template that starts in the past is not back-booked unasked.
      if (isBeforeBookFromPeriod(ref, rec.bookFromPeriod)) continue;

      const dueDay = occurrenceDate(ref, rec.dayOfMonth || 1);
      if (!includeDay(dueDay)) continue;

      const key = occurrenceKey(rec.id, ref);
      if (skipped.has(key) || alreadyBooked.has(key)) continue;

      open.push({ rec: due, dueDay });
    }
  }
  return open;
}

/**
 * Settles each open occurrence: adopts a hand-entered booking that stands for
 * it, otherwise — only with `create` — books it. A dry run writes nothing and
 * reports what a real run would do.
 */
async function settleOccurrences(
  open: OpenOccurrence[],
  mode: { create: boolean; dryRun?: boolean }
): Promise<BookedOccurrence[]> {
  const settled: BookedOccurrence[] = [];
  const report = (occurrence: OpenOccurrence, transactionId: string | null, adopted: boolean) => {
    settled.push({
      recurringId: occurrence.rec.id,
      accountId: occurrence.rec.accountId,
      transactionId,
      year: occurrence.dueDay.year,
      month: occurrence.dueDay.month,
      amountCents: occurrence.rec.amountCents,
      description: occurrence.rec.description,
      adopted
    });
  };

  // Without the intent to create (or to write at all) most occurrences end
  // without a write. One read of the possible hand-entered bookings decides
  // which occurrences are worth a lock; the lock repeats the check.
  const preview = mode.dryRun || !mode.create ? await loadAdoptionRowsFor(open) : null;
  const claimed = new Set<string>();

  for (const occurrence of open) {
    const { rec, dueDay } = occurrence;

    if (preview) {
      const candidate = pickAdoptionCandidate(preview, rec, dueDay, claimed);
      if (candidate) claimed.add(candidate.id);
      if (mode.dryRun) {
        if (candidate || mode.create) report(occurrence, null, candidate !== null);
        continue;
      }
      if (!candidate) continue;
    }

    // One failing occurrence (e.g. its account vanished mid-run) must not
    // abort the bookings of every other recurring/household in this run.
    let result: { id: string; adopted: boolean } | null;
    try {
      result = await settleOccurrenceOnce(rec, dueDay, mode.create);
    } catch (error) {
      // eslint-disable-next-line no-console -- surfaces in Railway logs, run continues
      console.error(
        "Failed to book recurring occurrence",
        { recurringId: rec.id, year: dueDay.year, month: dueDay.month },
        error
      );
      continue;
    }
    if (result) report(occurrence, result.id, result.adopted);
  }

  return settled;
}

/** The half-open instant range of the calendar days within the adoption window around `dueDay`. */
function adoptionWindow(dueDay: CalendarDate): { gte: Date; lt: Date } {
  return {
    gte: zonedTimeToUtc({ ...dueDay, day: dueDay.day - ADOPTION_WINDOW_DAYS }),
    lt: zonedTimeToUtc({ ...dueDay, day: dueDay.day + ADOPTION_WINDOW_DAYS + 1 })
  };
}

/**
 * Hand-entered bookings that might stand for one of the given occurrences —
 * a superset; `pickAdoptionCandidate` applies the exact rule.
 */
async function loadAdoptionRowsFor(open: OpenOccurrence[]): Promise<AdoptionRow[]> {
  if (open.length === 0) return [];
  const windows = open.map((o) => adoptionWindow(o.dueDay));
  return prisma.transaction.findMany({
    where: {
      deletedAt: null,
      recurringTransactionId: null,
      accountId: { in: [...new Set(open.map((o) => o.rec.accountId))] },
      amountCents: { in: [...new Set(open.map((o) => o.rec.amountCents))] },
      occurredAt: {
        gte: new Date(Math.min(...windows.map((w) => w.gte.getTime()))),
        lt: new Date(Math.max(...windows.map((w) => w.lt.getTime())))
      }
    },
    select: ADOPTION_ROW_SELECT
  });
}

/**
 * Links the hand-entered booking that stands for the occurrence, if there is
 * one, and returns its id. Only the two link columns are written (and, as on
 * every update, `updatedAt` by Prisma). The
 * update repeats the conditions that matter under concurrency: a booking that
 * another template adopted, "make recurring" linked or the user deleted or
 * changed in the meantime is not taken — the next best candidate is tried
 * instead.
 */
async function adoptManualBooking(
  tx: Prisma.TransactionClient,
  rec: DueRecurring,
  dueDay: CalendarDate,
  period: string
): Promise<string | null> {
  const rows = await tx.transaction.findMany({
    where: {
      deletedAt: null,
      recurringTransactionId: null,
      accountId: rec.accountId,
      amountCents: rec.amountCents,
      occurredAt: adoptionWindow(dueDay)
    },
    select: ADOPTION_ROW_SELECT
  });

  const lost = new Set<string>();
  for (;;) {
    const candidate = pickAdoptionCandidate(rows, rec, dueDay, lost);
    if (!candidate) return null;
    const linked = await tx.transaction.updateMany({
      where: {
        id: candidate.id,
        deletedAt: null,
        recurringTransactionId: null,
        accountId: rec.accountId,
        amountCents: rec.amountCents,
        categoryId: rec.categoryId,
        occurredAt: adoptionWindow(dueDay)
      },
      data: { recurringTransactionId: rec.id, recurringPeriod: period }
    });
    if (linked.count === 1) return candidate.id;
    lost.add(candidate.id);
  }
}

/**
 * Erledigt ein Vorkommen genau einmal: übernimmt eine von Hand erfasste
 * Buchung oder legt — nur mit `create` — die Buchung an. Cron, die
 * Selbstheilung beim Lesen (catchUpPastRecurringForHousehold) und die Übernahme
 * im Dashboard können gleichzeitig laufen — der transaktionsgebundene
 * Advisory-Lock je Dauerauftrag serialisiert "schon gebucht?"-Prüfen, Übernehmen
 * und Anlegen, sonst entstünden Doppelbuchungen. Geprüft wird unter dem Lock
 * dieselbe Vorkommens-Identität wie im Prefetch (Dauerauftrag + Periode,
 * Tombstones eingeschlossen).
 */
async function settleOccurrenceOnce(
  rec: DueRecurring,
  dueDay: CalendarDate,
  create: boolean
): Promise<{ id: string; adopted: boolean } | null> {
  const period = monthKey(dueDay);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rec.id}))`;
    const bookedKeys = await loadBookedOccurrenceKeys([rec.id], tx);
    if (bookedKeys.has(occurrenceKey(rec.id, period))) return null;

    const adoptedId = await adoptManualBooking(tx, rec, dueDay, period);
    if (adoptedId) return { id: adoptedId, adopted: true };
    if (!create) return null;

    const created = await tx.transaction.create({
      data: {
        accountId: rec.accountId,
        categoryId: rec.categoryId,
        amountCents: rec.amountCents,
        description: rec.description,
        // Noon in Berlin: the same calendar day in Berlin and in UTC.
        occurredAt: zonedTimeToUtc({ ...dueDay, hour: 12 }),
        taxRelevant: rec.taxRelevant,
        recurringTransactionId: rec.id,
        recurringPeriod: period
      },
      select: { id: true }
    });
    return { id: created.id, adopted: false };
  });
}

/**
 * Selbstheilung beim Lesen: bucht für einen Haushalt alle fälligen, noch nicht
 * gebuchten Vorkommen ABGESCHLOSSENER Monate nach. Der laufende Monat bleibt
 * Sache des täglichen Crons — bis dahin zeigt das Dashboard ihn als "geplant".
 * So kann ein ausgefallener Cron Rückblick und Übertrag nie mehr still
 * verfälschen (Vorfall: Cron war nie eingerichtet, Okt. 2026 fehlten alle
 * Daueraufträge im Rückblick). "Abgeschlossen" und "laufend" sind Berliner
 * Monate: um 00:30 Uhr am 1. (in UTC noch der Vormonat) ist der alte Monat
 * abgeschlossen.
 */
export async function catchUpPastRecurringForHousehold(
  householdId: string,
  now: Date = new Date()
): Promise<BookedOccurrence[]> {
  // Day 31 is clamped to the last day of the previous month by `occurrenceDate`.
  const endOfPreviousMonth = occurrenceDate(shiftMonth(zonedMonth(now), -1), 31);
  return bookOccurrencesDueBy(endOfPreviousMonth, { householdId });
}

/**
 * Übernahme im laufenden Monat: Für einen Haushalt versucht jedes Vorkommen,
 * das im laufenden Berliner Monat fällig, weder gebucht noch übersprungen ist
 * und nicht vor `bookFromPeriod` liegt, eine von Hand erfasste Buchung zu
 * übernehmen — auch wenn sein Tag noch nicht erreicht ist. Angelegt wird hier
 * nie etwas; das Buchen bleibt Sache des Crons. Das Dashboard ruft dies vor
 * dem Rechnen auf, damit eine von Hand erfasste Zahlung nicht zusätzlich als
 * "geplant" zählt. Jeder Eintrag der Rückgabe hat `adopted: true`.
 */
export async function adoptManualBookingsForCurrentMonth(
  householdId: string,
  now: Date = new Date()
): Promise<BookedOccurrence[]> {
  const current = zonedMonth(now);
  const open = await loadOpenOccurrences(
    { householdId },
    (schedule) => (isRecurringDueInMonth({ ...schedule, ...current }) ? [current] : []),
    () => true
  );
  return settleOccurrences(open, { create: false });
}
