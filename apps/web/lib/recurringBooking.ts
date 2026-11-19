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
 * auch ein einmaliges Nachbuchen der Vergangenheit ab (alle bisher
 * verpassten Monate werden im selben Lauf erkannt und gebucht).
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
 * WICHTIG — bekannte Grenze: Eine von Hand angelegte Transaktion hat kein
 * `recurringTransactionId` und wird deshalb vom "schon gebucht?"-Check nicht
 * erkannt. Beim ersten Rollout auf echten Daten (Nachbuchen der
 * Vergangenheit) kann das zu Doppelbuchungen führen, wenn bereits von Hand
 * gebucht wurde, was ein Dauerauftrag jetzt automatisch bucht. Deshalb:
 * `dryRun: true` zeigt vorher genau, was gebucht würde — das gehört von
 * Menschen gegen die bestehenden Buchungen gegengeprüft, bevor der echte
 * (nicht-dryRun) Lauf passiert.
 */
import {
  dueMonthsBetween,
  isOnOrBeforeDate,
  monthKey,
  occurrenceDate,
  shiftMonth,
  zonedDate,
  zonedMonth,
  zonedTimeToUtc,
  type CalendarDate
} from "@doewe/shared";

import { DEMO_ACCOUNT_ID } from "./demoConstants";
import { prisma } from "./prisma";
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

type DueRecurring = {
  id: string;
  accountId: string;
  categoryId: string | null;
  amountCents: number;
  description: string;
  taxRelevant: boolean;
};

/** Books every occurrence that is due on the Berlin calendar day of `now`. */
export async function materializeDueRecurringTransactions(
  now: Date = new Date(),
  options: { dryRun?: boolean; householdId?: string } = {}
): Promise<BookedOccurrence[]> {
  return bookOccurrencesDueBy(zonedDate(now), options);
}

/** Books every unbooked, unskipped occurrence whose due day is `today` or earlier. */
async function bookOccurrencesDueBy(
  today: CalendarDate,
  options: { dryRun?: boolean; householdId?: string }
): Promise<BookedOccurrence[]> {
  const recurringTransactions = await prisma.recurringTransaction.findMany({
    // The public demo account is reseeded by /api/demo/seed and must never
    // receive real bookings — same exclusion as admin/usage/route.ts.
    where: {
      deletedAt: null,
      accountId: { not: DEMO_ACCOUNT_ID },
      ...(options.householdId ? { account: { householdId: options.householdId } } : {})
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
      // Nested reads bypass the soft-delete filter: a deleted category must
      // not pass its tax flag on (a manual booking could not use it either).
      category: { select: { isTaxRelevant: true, deletedAt: true } }
    }
  });

  // Prefetch skips and already-booked periods in a few queries instead of one
  // round trip per recurring x month — this runs on every dashboard load now
  // (catchUpPastRecurringForHousehold), so the steady state must stay cheap.
  const recurringIds = recurringTransactions.map((r) => r.id);
  const [skipRows, alreadyBooked] = await Promise.all([
    prisma.recurringTransactionSkip.findMany({
      where: { recurringId: { in: recurringIds } },
      select: { recurringId: true, year: true, month: true }
    }),
    loadBookedOccurrenceKeys(recurringIds)
  ]);
  const skipped = new Set(skipRows.map((s) => occurrenceKey(s.recurringId, s)));

  const booked: BookedOccurrence[] = [];

  for (const rec of recurringTransactions) {
    const anchor = zonedMonth(rec.nextOccurrence);
    const dueMonths = dueMonthsBetween({
      nextYear: anchor.year,
      nextMonth: anchor.month,
      intervalMonths: rec.intervalMonths,
      untilYear: today.year,
      untilMonth: today.month
    });
    const due: DueRecurring = {
      id: rec.id,
      accountId: rec.accountId,
      categoryId: rec.categoryId,
      amountCents: rec.amountCents,
      description: rec.description,
      taxRelevant: rec.category !== null && rec.category.deletedAt === null && rec.category.isTaxRelevant
    };

    for (const { year, month } of dueMonths) {
      const dueDay = occurrenceDate({ year, month }, rec.dayOfMonth || 1);

      // Don't book an occurrence whose day hasn't arrived yet this month.
      if (!isOnOrBeforeDate(dueDay, today)) continue;

      const key = occurrenceKey(rec.id, { year, month });
      if (skipped.has(key) || alreadyBooked.has(key)) continue;

      if (options.dryRun) {
        booked.push({
          recurringId: rec.id,
          accountId: rec.accountId,
          transactionId: null,
          year,
          month,
          amountCents: rec.amountCents,
          description: rec.description
        });
        continue;
      }

      // One failing occurrence (e.g. its account vanished mid-run) must not
      // abort the bookings of every other recurring/household in this run.
      let created: { id: string } | null;
      try {
        created = await bookOccurrenceOnce(due, dueDay);
      } catch (error) {
        // eslint-disable-next-line no-console -- surfaces in Railway logs, run continues
        console.error("Failed to book recurring occurrence", { recurringId: rec.id, year, month }, error);
        continue;
      }
      if (!created) continue;

      booked.push({
        recurringId: rec.id,
        accountId: rec.accountId,
        transactionId: created.id,
        year,
        month,
        amountCents: rec.amountCents,
        description: rec.description
      });
    }
  }

  return booked;
}

/**
 * Bucht ein Vorkommen genau einmal. Cron und die Selbstheilung beim Lesen
 * (siehe catchUpPastRecurringForHousehold) können gleichzeitig laufen — der
 * transaktionsgebundene Advisory-Lock je Dauerauftrag serialisiert das
 * "schon gebucht?"-Prüfen und Anlegen, sonst entstünden Doppelbuchungen.
 * Geprüft wird unter dem Lock dieselbe Vorkommens-Identität wie im Prefetch
 * (Dauerauftrag + Periode, Tombstones eingeschlossen).
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
