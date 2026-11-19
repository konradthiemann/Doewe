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
 *
 * POST Body: { accountId, categoryId?, amountCents, description, intervalMonths? (1-24), dayOfMonth? (1-31), startDate? (yyyy-mm-dd) }
 */
import { firstOccurrenceFrom, parseDayKey, zonedDate, zonedTimeToUtc } from "@doewe/shared";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
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
    .optional()
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
  // Startdatum (falls angegeben) legt die erste Buchung direkt fest; ansonsten wird
  // sie aus dayOfMonth und dem heutigen Berliner Kalendertag berechnet.
  const startDay = data.startDate ? parseDayKey(data.startDate) : null;
  const day = data.dayOfMonth ?? startDay?.day ?? 1;
  const firstDay = startDay ?? firstOccurrenceFrom(zonedDate(new Date()), day);
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
    nextOccurrence: nextDate
  } as Prisma.RecurringTransactionUncheckedCreateInput;

  const created = await prisma.recurringTransaction.create({
    data: createData
  });
  return NextResponse.json(created, { status: 201 });
}
