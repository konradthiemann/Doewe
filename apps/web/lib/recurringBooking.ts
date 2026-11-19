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
 * Von Hand erfasste Zahlung — Vorschlag und Bestätigung: Der Lauf verknüpft
 * nie von sich aus eine von Hand angelegte Buchung mit einem Vorkommen. Die
 * Regel kann "früher bezahlt" nicht von "zusätzlich bezahlt" unterscheiden,
 * und eine still fehlende Buchung ist schlimmer als eine sichtbare doppelte,
 * die der Nutzer löschen kann. `loadRecurringSuggestions` schlägt für die
 * offenen Vorkommen des laufenden Monats eine passende Buchung vor
 * (`pickAdoptionCandidate` in @doewe/shared: gleiches Konto, gleicher Betrag,
 * gleiche Kategorie bzw. ohne Kategorie gleiche Beschreibung, höchstens 7
 * Kalendertage um den Fälligkeitstag, nicht gelöscht, mit keinem Dauerauftrag
 * verknüpft) und schreibt dabei nichts. Verknüpft wird erst, wenn der Nutzer
 * bestätigt (`linkBookingToOccurrence`, POST
 * /api/recurring-transactions/[id]/link-booking).
 */
import {
  adoptionMismatch,
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
  ADOPTION_WINDOW_DAYS,
  type AdoptionMismatch,
  type AdoptionRow,
  type CalendarDate,
  type MonthRef,
  type RecurringAnchor
} from "@doewe/shared";

import { DEMO_ACCOUNT_ID } from "./demoConstants";
import { LOCKED_TRANSACTION_OPTIONS, prisma } from "./prisma";
import { loadBookedOccurrenceKeys, occurrenceKey } from "./recurringPeriods";

export type BookedOccurrence = {
  recurringId: string;
  accountId: string;
  /** null when dryRun — nothing was actually written. */
  transactionId: string | null;
  year: number;
  month: number;
  amountCents: number;
  description: string;
};

/** A hand-entered booking that looks like an open occurrence of a standing order. */
export type RecurringSuggestion = {
  recurringId: string;
  /** The occurrence's month, "YYYY-MM" (Europe/Berlin). */
  period: string;
  /** The occurrence's due day, "yyyy-mm-dd" (Europe/Berlin). */
  dueDay: string;
  transactionId: string;
  transactionDescription: string;
  /** ISO instant of the booking. */
  transactionOccurredAt: string;
  amountCents: number;
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

  const booked: BookedOccurrence[] = [];
  for (const { rec, dueDay } of open) {
    let transactionId: string | null = null;
    if (!options.dryRun) {
      // One failing occurrence (e.g. its account vanished mid-run) must not
      // abort the bookings of every other recurring/household in this run.
      let created: { id: string } | null;
      try {
        created = await bookOccurrenceOnce(rec, dueDay);
      } catch (error) {
        // eslint-disable-next-line no-console -- surfaces in Railway logs, run continues
        console.error(
          "Failed to book recurring occurrence",
          { recurringId: rec.id, year: dueDay.year, month: dueDay.month },
          error
        );
        continue;
      }
      if (!created) continue;
      transactionId = created.id;
    }
    booked.push({
      recurringId: rec.id,
      accountId: rec.accountId,
      transactionId,
      year: dueDay.year,
      month: dueDay.month,
      amountCents: rec.amountCents,
      description: rec.description
    });
  }
  return booked;
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
  // (catchUpPastRecurringForHousehold, loadRecurringSuggestions), so the
  // steady state must stay cheap.
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
 * Bucht ein Vorkommen genau einmal. Cron und die Selbstheilung beim Lesen
 * (catchUpPastRecurringForHousehold) können gleichzeitig laufen, ebenso eine
 * Bestätigung (linkBookingToOccurrence) — der transaktionsgebundene
 * Advisory-Lock je Dauerauftrag serialisiert "schon gebucht?"-Prüfen und
 * Anlegen bzw. Verknüpfen, sonst entstünden Doppelbuchungen. Geprüft wird
 * unter dem Lock dieselbe Vorkommens-Identität wie im Prefetch (Dauerauftrag +
 * Periode, Tombstones eingeschlossen).
 */
async function bookOccurrenceOnce(rec: DueRecurring, dueDay: CalendarDate): Promise<{ id: string } | null> {
  const period = monthKey(dueDay);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rec.id}))`;
    const bookedKeys = await loadBookedOccurrenceKeys([rec.id], tx);
    if (bookedKeys.has(occurrenceKey(rec.id, period))) return null;

    return tx.transaction.create({
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
  }, LOCKED_TRANSACTION_OPTIONS);
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

const pad2 = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: CalendarDate) => `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;

/**
 * Vorschläge für den laufenden Berliner Monat: Für jedes Vorkommen, das in
 * diesem Monat fällig, weder gebucht noch übersprungen ist und nicht vor
 * `bookFromPeriod` liegt — auch wenn sein Tag noch nicht erreicht ist —, die
 * von Hand erfasste Buchung, die am besten dafür steht (`pickAdoptionCandidate`).
 * Jede Buchung wird für höchstens ein Vorkommen vorgeschlagen; die Vorkommen
 * kommen in der Reihenfolge ihres Fälligkeitstags zum Zug.
 *
 * Schreibt nichts. Bis der Nutzer bestätigt, zählt die Buchung als gebucht und
 * das Vorkommen als geplant — der Vorschlag ist es, der darauf hinweist.
 */
export async function loadRecurringSuggestions(
  householdId: string,
  now: Date = new Date()
): Promise<RecurringSuggestion[]> {
  const current = zonedMonth(now);
  const open = await loadOpenOccurrences(
    { householdId },
    (schedule) => (isRecurringDueInMonth({ ...schedule, ...current }) ? [current] : []),
    () => true
  );
  open.sort((a, b) => a.dueDay.day - b.dueDay.day || (a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0));

  const rows = await loadAdoptionRowsFor(open);
  const claimed = new Set<string>();
  const suggestions: RecurringSuggestion[] = [];
  for (const { rec, dueDay } of open) {
    const candidate = pickAdoptionCandidate(rows, rec, dueDay, claimed);
    if (!candidate) continue;
    claimed.add(candidate.id);
    suggestions.push({
      recurringId: rec.id,
      period: monthKey(dueDay),
      dueDay: dayKey(dueDay),
      transactionId: candidate.id,
      transactionDescription: candidate.description,
      transactionOccurredAt: candidate.occurredAt.toISOString(),
      amountCents: candidate.amountCents
    });
  }
  return suggestions;
}

export type LinkBookingResult =
  | { status: "linked"; id: string; recurringTransactionId: string; recurringPeriod: string }
  | { status: "not_found"; error: string }
  | { status: "conflict"; error: string };

const MISMATCH_ERRORS: Record<AdoptionMismatch, string> = {
  deleted: "The booking has been deleted",
  linked: "The booking already belongs to a recurring transaction",
  account: "The booking is on another account than the recurring transaction",
  amount: "The booking's amount differs from the recurring transaction's",
  category: "The booking's category differs from the recurring transaction's",
  description: "The booking's description differs from the recurring transaction's",
  date: `The booking is more than ${ADOPTION_WINDOW_DAYS} days away from the due day`
};

/**
 * Bestätigung eines Vorschlags: verknüpft die Buchung `transactionId` als das
 * Vorkommen `period` ("JJJJ-MM") des Dauerauftrags `recurringId`. Unter
 * demselben Advisory-Lock wie das Buchen (und einer Zeilensperre auf der
 * Buchung, damit ein anderer Dauerauftrag oder ein Löschen nicht dazwischen
 * kommt) wird alles erneut geprüft: Dauerauftrag und Buchung im Haushalt
 * (sonst not_found), Periode ein fälliger Monat und nicht vor `bookFromPeriod`,
 * Vorkommen weder übersprungen noch gebucht, Buchung ein Kandidat nach
 * `adoptionMismatch` (sonst conflict). Geschrieben werden nur
 * `recurringTransactionId` und `recurringPeriod` (und von Prisma `updatedAt`).
 */
export async function linkBookingToOccurrence(params: {
  householdId: string;
  recurringId: string;
  transactionId: string;
  period: string;
}): Promise<LinkBookingResult> {
  const { householdId, recurringId, transactionId, period } = params;
  const ref: MonthRef = { year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };

  return prisma.$transaction(async (tx): Promise<LinkBookingResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${recurringId}))`;
    await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id = ${transactionId} FOR UPDATE`;

    const rec = await tx.recurringTransaction.findFirst({
      where: { id: recurringId, deletedAt: null, account: { householdId } },
      select: {
        id: true,
        accountId: true,
        categoryId: true,
        amountCents: true,
        description: true,
        intervalMonths: true,
        dayOfMonth: true,
        nextOccurrence: true,
        bookFromPeriod: true
      }
    });
    if (!rec) return { status: "not_found", error: "Recurring transaction not found" };

    // findUnique sees tombstones: a deleted booking is refused as deleted below.
    const booking = await tx.transaction.findUnique({
      where: { id: transactionId },
      select: {
        ...ADOPTION_ROW_SELECT,
        deletedAt: true,
        recurringTransactionId: true,
        account: { select: { householdId: true } }
      }
    });
    if (!booking || booking.account.householdId !== householdId) {
      return { status: "not_found", error: "Transaction not found" };
    }

    const anchor = zonedMonth(rec.nextOccurrence);
    if (!isRecurringDueInMonth({ nextYear: anchor.year, nextMonth: anchor.month, intervalMonths: rec.intervalMonths, ...ref })) {
      return { status: "conflict", error: "The recurring transaction is not due in this month" };
    }
    if (isBeforeBookFromPeriod(ref, rec.bookFromPeriod)) {
      return { status: "conflict", error: "The recurring transaction is not booked for months before it starts booking" };
    }
    const skip = await tx.recurringTransactionSkip.findUnique({
      where: { recurringId_year_month: { recurringId, year: ref.year, month: ref.month } },
      select: { recurringId: true }
    });
    if (skip) return { status: "conflict", error: "This month of the recurring transaction is skipped" };

    const bookedKeys = await loadBookedOccurrenceKeys([recurringId], tx);
    if (bookedKeys.has(occurrenceKey(recurringId, period))) {
      return { status: "conflict", error: "This month of the recurring transaction is already booked" };
    }

    const mismatch = adoptionMismatch(booking, rec, occurrenceDate(ref, rec.dayOfMonth || 1));
    if (mismatch) return { status: "conflict", error: MISMATCH_ERRORS[mismatch] };

    const linked = await tx.transaction.update({
      where: { id: transactionId },
      data: { recurringTransactionId: recurringId, recurringPeriod: period },
      select: { id: true }
    });
    return { status: "linked", id: linked.id, recurringTransactionId: recurringId, recurringPeriod: period };
  }, LOCKED_TRANSACTION_OPTIONS);
}
