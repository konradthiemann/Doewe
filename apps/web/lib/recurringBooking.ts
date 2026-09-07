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
  options: { dryRun?: boolean } = {}
): Promise<BookedOccurrence[]> {
  const recurringTransactions = await prisma.recurringTransaction.findMany({
    where: { deletedAt: null },
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

      const skip = await prisma.recurringTransactionSkip.findUnique({
        where: { recurringId_year_month: { recurringId: rec.id, year, month } }
      });
      if (skip) continue;

      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 1);
      const existing = await prisma.transaction.findFirst({
        where: { recurringTransactionId: rec.id, occurredAt: { gte: monthStart, lt: monthEnd } },
        select: { id: true }
      });
      if (existing) continue;

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

      const created = await prisma.transaction.create({
        data: {
          accountId: rec.accountId,
          categoryId: rec.categoryId,
          amountCents: rec.amountCents,
          description: rec.description,
          occurredAt,
          recurringTransactionId: rec.id
        }
      });

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
