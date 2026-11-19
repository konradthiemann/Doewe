/**
 * Which occurrences of a recurring transaction count as booked.
 *
 * An occurrence is identified by its template and the month it was booked
 * for (`Transaction.recurringPeriod`, "YYYY-MM" in Europe/Berlin) — not by
 * the month of `occurredAt`, which the user may change, and not only by live
 * rows: a booking the user deleted still occupies its period. Otherwise the
 * month would look unbooked and be booked again on the next run.
 *
 * See docs/calculations/00-grundregeln.md §4.
 */
import { monthKey, zonedMonth, type MonthRef } from "@doewe/shared";

import { prisma } from "./prisma";

import type { Prisma } from "@prisma/client";

type TransactionReader = { transaction: Pick<Prisma.TransactionClient["transaction"], "findMany"> };

export function occurrenceKey(recurringId: string, period: string | MonthRef): string {
  return `${recurringId}:${typeof period === "string" ? period : monthKey(period)}`;
}

/**
 * The period a booking stands for. Rows written before `recurringPeriod`
 * existed fall back to the Berlin month of their date.
 */
export function periodOfBooking(row: { recurringPeriod: string | null; occurredAt: Date }): string {
  return row.recurringPeriod ?? monthKey(zonedMonth(row.occurredAt));
}

/**
 * `occurrenceKey`s of every booked occurrence of the given templates,
 * deleted bookings included. Pass the transaction client to read inside a
 * `prisma.$transaction`.
 */
export async function loadBookedOccurrenceKeys(
  recurringIds: string[],
  client: TransactionReader = prisma
): Promise<Set<string>> {
  const keys = new Set<string>();
  if (recurringIds.length === 0) return keys;

  const select = { recurringTransactionId: true, recurringPeriod: true, occurredAt: true } as const;
  const where = { recurringTransactionId: { in: recurringIds } };
  // The soft-delete filter in lib/prisma.ts hides tombstones unless the query
  // names `deletedAt` itself, so deleted bookings need their own query.
  const liveRows = await client.transaction.findMany({ where, select });
  const deletedRows = await client.transaction.findMany({ where: { ...where, deletedAt: { not: null } }, select });

  for (const row of [...liveRows, ...deletedRows]) {
    if (row.recurringTransactionId) keys.add(occurrenceKey(row.recurringTransactionId, periodOfBooking(row)));
  }
  return keys;
}
