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
 * Idempotent: ein Monat gilt als bereits gebucht, sobald irgendeine
 * Transaction mit `recurringTransactionId` in diesem Monat existiert.
 *
 * WICHTIG — bekannte Grenze: Eine VOR dieser Funktion von Hand angelegte
 * Transaktion hat kein `recurringTransactionId` und wird deshalb vom
 * "schon gebucht?"-Check nicht erkannt. Beim ersten Rollout auf echten Daten
 * (Nachbuchen der Vergangenheit) kann das zu Doppelbuchungen führen, wenn
 * bereits von Hand gebucht wurde, was ein Dauerauftrag jetzt automatisch
 * bucht. Deshalb: `dryRun: true` zeigt vorher genau, was gebucht würde —
 * das gehört von Menschen gegen die bestehenden Buchungen gegengeprüft, bevor
 * der echte (nicht-dryRun) Lauf passiert.
 */
import { dueMonthsBetween } from "@doewe/shared";

import { DEMO_ACCOUNT_ID } from "./demoConstants";
import { prisma } from "./prisma";

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

export async function materializeDueRecurringTransactions(
  now: Date = new Date(),
  options: { dryRun?: boolean; householdId?: string } = {}
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
      nextOccurrence: true
    }
  });

  // Prefetch skips and already-booked months in two queries instead of one
  // round trip per recurring x month — this runs on every dashboard load now
  // (catchUpPastRecurringForHousehold), so the steady state must stay cheap.
  const recurringIds = recurringTransactions.map((r) => r.id);
  const monthKey = (recurringId: string, year: number, month: number) => `${recurringId}:${year}-${month}`;
  const [skipRows, bookedRows] = await Promise.all([
    prisma.recurringTransactionSkip.findMany({
      where: { recurringId: { in: recurringIds } },
      select: { recurringId: true, year: true, month: true }
    }),
    prisma.transaction.findMany({
      where: { recurringTransactionId: { in: recurringIds } },
      select: { recurringTransactionId: true, occurredAt: true }
    })
  ]);
  const skipped = new Set(skipRows.map((s) => monthKey(s.recurringId, s.year, s.month)));
  const alreadyBooked = new Set(
    bookedRows.map((t) => monthKey(t.recurringTransactionId ?? "", t.occurredAt.getFullYear(), t.occurredAt.getMonth() + 1))
  );

  const booked: BookedOccurrence[] = [];

  for (const rec of recurringTransactions) {
    const anchor = new Date(rec.nextOccurrence);
    const dueMonths = dueMonthsBetween({
      nextYear: anchor.getFullYear(),
      nextMonth: anchor.getMonth() + 1,
      intervalMonths: rec.intervalMonths,
      untilYear: now.getFullYear(),
      untilMonth: now.getMonth() + 1
    });

    for (const { year, month } of dueMonths) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const day = Math.min(rec.dayOfMonth || 1, daysInMonth);
      const occurredAt = new Date(year, month - 1, day);

      // Don't book an occurrence whose day hasn't arrived yet this month.
      if (occurredAt.getTime() > now.getTime()) continue;

      const key = monthKey(rec.id, year, month);
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
        created = await bookOccurrenceOnce(rec, year, month, occurredAt);
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
 */
async function bookOccurrenceOnce(
  rec: { id: string; accountId: string; categoryId: string | null; amountCents: number; description: string },
  year: number,
  month: number,
  occurredAt: Date
): Promise<{ id: string } | null> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rec.id}))`;
    const existing = await tx.transaction.findFirst({
      where: { recurringTransactionId: rec.id, occurredAt: { gte: monthStart, lt: monthEnd } },
      select: { id: true }
    });
    if (existing) return null;
    return tx.transaction.create({
      data: {
        accountId: rec.accountId,
        categoryId: rec.categoryId,
        amountCents: rec.amountCents,
        description: rec.description,
        occurredAt,
        recurringTransactionId: rec.id
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
 * Daueraufträge im Rückblick).
 */
export async function catchUpPastRecurringForHousehold(
  householdId: string,
  now: Date = new Date()
): Promise<BookedOccurrence[]> {
  const endOfPreviousMonth = new Date(new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1);
  return materializeDueRecurringTransactions(endOfPreviousMonth, { householdId });
}
