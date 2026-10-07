/**
 * POST /api/transactions/[id]/make-recurring — Aus einer bestehenden Buchung einen Dauerauftrag machen
 *
 * Legt eine RecurringTransaction (MONTHLY) mit Konto, Kategorie, Betrag (Vorzeichen wie gespeichert)
 * und Beschreibung der Buchung an und verknüpft die Buchung damit (recurringTransactionId). Der
 * Anker `nextOccurrence` ist der Buchungstag (Europe/Berlin) + intervalMonths, optional mit
 * abweichendem dayOfMonth — so wird der Ursprungsmonat nicht erneut automatisch gebucht.
 *
 * Haushaltsbezogen (kein Demo-Account-Sonderweg nötig): die Buchung wird über ihr Konto im Haushalt
 * des Nutzers gesucht. Soft-gelöschte Buchungen filtert die Extension in lib/prisma.ts heraus.
 *
 * POST Body: { intervalMonths (1-24), dayOfMonth? (1-31) }
 * Antworten: 201 RecurringTransaction | 400 | 401 | 404 | 409 (bereits verknüpft)
 */
import { addMonthsClamped } from "@doewe/shared";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

import { MakeRecurringInput } from "./schema";

const BOOKING_TIME_ZONE = "Europe/Berlin";
const ALREADY_LINKED_ERROR = "Transaction is already linked to a recurring transaction";

class AlreadyLinkedError extends Error {}

/** Calendar day of `instant` in Europe/Berlin (not the process time zone). */
function berlinCalendarDate(instant: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

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

  const booking = berlinCalendarDate(source.occurredAt);
  const next = addMonthsClamped(booking, intervalMonths, dayOfMonth);
  const nextOccurrence = new Date(next.year, next.month - 1, next.day, 0, 0, 0, 0);

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
      const linked = await tx.transaction.updateMany({
        where: { id: source.id, recurringTransactionId: null },
        data: { recurringTransactionId: created.id }
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
