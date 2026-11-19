/**
 * GET  /api/recurring-transactions  — Alle Daueraufträge des Nutzers (nach nextOccurrence sortiert)
 * POST /api/recurring-transactions  — Neuen Dauerauftrag anlegen
 *
 * Daueraufträge sind Vorlagen für regelmäßige Transaktionen (z.B. Miete jeden 1. des Monats).
 * Fällige Vorkommen werden automatisch als echte Transaktionen gebucht: täglich vom Cron
 * (POST /api/cron/materialize-recurring) und für abgeschlossene Monate beim Lesen von
 * Dashboard und Rückblick (siehe lib/recurringBooking.ts). Nur ein im laufenden Monat
 * fälliges, noch nicht gebuchtes Vorkommen rechnet das Dashboard als "geplant" ein.
 *
 * `nextOccurrence` ist der Anker der Serie (erste Buchung) und wird als 12:00 Uhr Berliner
 * Zeit des gemeinten Kalendertags gespeichert. Ohne `startDate` wird er aus `dayOfMonth`
 * berechnet: laufender Monat nur, falls der (auf die Monatslänge begrenzte) Tag noch
 * bevorsteht, also nach heute liegt; ist er heute oder schon vorbei, nächster Monat —
 * "heute" ist der Kalendertag in Europe/Berlin. So wird eine heute von Hand erfasste
 * Zahlung nicht zusätzlich vom Cron gebucht, wenn danach der Dauerauftrag angelegt wird.
 * Alternativ kann ein `startDate` (yyyy-mm-dd) übergeben werden — dann ist dieses Datum die
 * erste Buchung, z.B. für ein Abo, dessen erste Zahlung erst in einigen Monaten fällig wird.
 * Gebucht wird am `dayOfMonth`: liegt dieser Tag (auf die Monatslänge begrenzt) im Monat des
 * Startdatums VOR dem Startdatum, beginnt die Serie im Folgemonat (Start 20. November, Tag 5
 * → erste Buchung 5. Dezember) — nie vor dem Datum, das als erste Buchung eingegeben wurde.
 * `startDate` darf höchstens 10 Jahre vor oder nach heute liegen (400 sonst).
 *
 * Kein ungefragtes Nachbuchen: Liegt die erste Buchung in einem Monat vor dem laufenden
 * Berliner Monat, wird `bookFromPeriod` auf den laufenden Monat gesetzt — die Monate davor
 * bucht der Lauf nicht. Mit `backfill: true` bleibt `bookFromPeriod` leer und jeder fällige
 * Monat seit dem Start wird nachgebucht.
 *
 * POST Body: { accountId, categoryId?, amountCents, description, intervalMonths? (1-24), dayOfMonth? (1-31), startDate? (yyyy-mm-dd), backfill? (boolean) }
 */
import {
  RECURRING_START_MAX_YEARS,
  bookFromPeriodFor,
  firstOccurrenceFrom,
  firstOccurrenceOnOrAfter,
  isWithinYearsOf,
  parseDayKey,
  zonedDate,
  zonedMonth,
  zonedTimeToUtc,
  type CalendarDate
} from "@doewe/shared";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { freezePastMonths } from "../../../lib/categoryBudgets";
import { prisma } from "../../../lib/prisma";

const RecurringInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  amountCents: z.number().int(),
  description: z.string().min(1),
  intervalMonths: z.number().int().min(1).max(24).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => parseDayKey(value) !== null, "Ungültiges Datum")
    .optional(),
  backfill: z.boolean().optional()
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.recurringTransaction.findMany({
    where: { account: { householdId: user.householdId } },
    orderBy: { nextOccurrence: "asc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = RecurringInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const now = new Date();
  const today = zonedDate(now);
  const startDay = data.startDate ? parseDayKey(data.startDate) : null;
  if (startDay && !isWithinYearsOf(startDay, today)) {
    return NextResponse.json(
      {
        error: {
          formErrors: [],
          fieldErrors: { startDate: [`Start date must be within ${RECURRING_START_MAX_YEARS} years of today`] }
        }
      },
      { status: 400 }
    );
  }

  const account = await prisma.account.findFirst({ where: { id: data.accountId, householdId: user.householdId } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, householdId: user.householdId } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }
  // Startdatum (falls angegeben) legt die erste Buchung fest; ansonsten wird
  // sie aus dayOfMonth und dem heutigen Berliner Kalendertag berechnet.
  const day = data.dayOfMonth ?? startDay?.day ?? 1;
  let firstDay: CalendarDate;
  if (startDay) {
    // Booked on `day`: if that day lies before the start date in its month, the
    // series begins in the following month. Otherwise the anchor stays the
    // start date itself (the schedule reads only its month).
    const firstBooking = firstOccurrenceOnOrAfter(startDay, day);
    firstDay = firstBooking.month === startDay.month ? startDay : firstBooking;
  } else {
    firstDay = firstOccurrenceFrom(today, day);
  }
  // 12:00 Uhr Berliner Zeit: in Berlin und in UTC derselbe Kalendertag.
  const nextDate = zonedTimeToUtc({ ...firstDay, hour: 12 });

  const createData = {
    accountId: data.accountId,
    categoryId: data.categoryId,
    amountCents: data.amountCents,
    description: data.description,
    frequency: "MONTHLY",
    intervalMonths: data.intervalMonths ?? 1,
    dayOfMonth: day,
    nextOccurrence: nextDate,
    // A series that starts before the current month is booked from the current
    // month on, unless the user asked for the months in between.
    bookFromPeriod: bookFromPeriodFor(firstDay, zonedMonth(now), data.backfill ?? false)
  } as Prisma.RecurringTransactionUncheckedCreateInput;

  // Freeze the budgets of past months first: a YEARLY plan is distributed by
  // the standing orders, so changing one would otherwise change old months.
  await freezePastMonths(user.householdId);
  const created = await prisma.recurringTransaction.create({
    data: createData
  });
  return NextResponse.json(created, { status: 201 });
}
