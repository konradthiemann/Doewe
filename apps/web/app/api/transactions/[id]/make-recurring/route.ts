/**
 * POST /api/transactions/[id]/make-recurring — Aus einer bestehenden Buchung einen Dauerauftrag machen
 *
 * Legt eine RecurringTransaction (MONTHLY) mit Konto, Kategorie, Betrag (Vorzeichen wie gespeichert)
 * und Beschreibung der Buchung an und verknüpft die Buchung damit (recurringTransactionId). Der
 * Anker `nextOccurrence` ist der Buchungstag (Europe/Berlin) + intervalMonths, optional mit
 * abweichendem dayOfMonth, gespeichert als 12:00 Uhr Berliner Zeit dieses Tages — so wird der
 * Ursprungsmonat nicht erneut automatisch gebucht. Die Buchung selbst gilt als das Vorkommen
 * ihres Berliner Monats (`recurringPeriod`), auch wenn sie später verschoben oder gelöscht wird.
 *
 * Haushaltsbezogen (kein Demo-Account-Sonderweg nötig): die Buchung wird über ihr Konto im Haushalt
 * des Nutzers gesucht. Soft-gelöschte Buchungen filtert die Extension in lib/prisma.ts heraus.
 *
 * POST Body: { intervalMonths (1-24), dayOfMonth? (1-31) }
 * Antworten: 201 RecurringTransaction | 400 | 401 | 404 | 409 (bereits verknüpft)
 */
import { addMonthsClamped, monthKey, zonedDate, zonedTimeToUtc } from "@doewe/shared";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

import { MakeRecurringInput } from "./schema";

const ALREADY_LINKED_ERROR = "Transaction is already linked to a recurring transaction";

class AlreadyLinkedError extends Error {}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = MakeRecurringInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { intervalMonths, dayOfMonth } = parsed.data;

  const source = await prisma.transaction.findFirst({
    where: { id: params.id, account: { householdId: user.householdId } }
  });
  if (!source) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (source.recurringTransactionId) {
    return NextResponse.json({ error: ALREADY_LINKED_ERROR }, { status: 409 });
  }

  const booking = zonedDate(source.occurredAt);
  const next = addMonthsClamped(booking, intervalMonths, dayOfMonth);
  // 12:00 Uhr Berliner Zeit: in Berlin und in UTC derselbe Kalendertag.
  const nextOccurrence = zonedTimeToUtc({ ...next, hour: 12 });

  try {
    const recurring = await prisma.$transaction(async (tx) => {
      const created = await tx.recurringTransaction.create({
        data: {
          accountId: source.accountId,
          categoryId: source.categoryId,
          amountCents: source.amountCents,
          description: source.description,
          frequency: "MONTHLY",
          intervalMonths,
          dayOfMonth: dayOfMonth ?? booking.day,
          nextOccurrence
        }
      });
      // Guard against a concurrent request linking the booking first: roll back if we lost the race.
      // The booking is the occurrence of its own month; recording that period keeps the
      // occurrence where it is when the user later moves the booking into another month.
      const linked = await tx.transaction.updateMany({
        where: { id: source.id, recurringTransactionId: null },
        data: { recurringTransactionId: created.id, recurringPeriod: monthKey(booking) }
      });
      if (linked.count === 0) throw new AlreadyLinkedError();
      return created;
    });
    return NextResponse.json(recurring, { status: 201 });
  } catch (error) {
    if (error instanceof AlreadyLinkedError) {
      return NextResponse.json({ error: ALREADY_LINKED_ERROR }, { status: 409 });
    }
    throw error;
  }
}
