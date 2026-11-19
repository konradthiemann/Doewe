/**
 * PATCH  /api/recurring-transactions/[id] — Dauerauftrag ändern
 * DELETE /api/recurring-transactions/[id] — Dauerauftrag löschen (Soft-Delete)
 *
 * Haushaltsbezogen (401 ohne Session, 404 außerhalb des eigenen Haushalts).
 *
 * Der Anker `nextOccurrence` wird nur angefasst, wenn `startDate` oder `dayOfMonth` im Body
 * steht, und immer als 12:00 Uhr Berliner Zeit des gemeinten Kalendertags gespeichert:
 * - `startDate` (yyyy-mm-dd, hat Vorrang) setzt die Serie neu auf: dieses Datum ist die
 *   erste Buchung.
 * - `dayOfMonth` allein ändert nur den Tag: der Anker-Monat bleibt, der Tag wird auf die
 *   Länge dieses Monats begrenzt. Die Serie wird dadurch NICHT neu aufgesetzt — bei einem
 *   Intervall über 1 bleiben die fälligen Monate dieselben, und kein früherer Monat fällt
 *   aus der Jahresübersicht.
 * Bereits gebuchte Vorkommen bleiben in beiden Fällen unberührt.
 *
 * PATCH Body: { accountId?, categoryId? (null erlaubt), amountCents?, description?, intervalMonths? (1-24), dayOfMonth? (1-31), startDate? (yyyy-mm-dd) }
 */
import { occurrenceDate, parseDayKey, zonedMonth, zonedTimeToUtc, type CalendarDate } from "@doewe/shared";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

const UpdateInput = z.object({
  accountId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional().nullable(),
  amountCents: z.number().int().optional(),
  description: z.string().min(1).optional(),
  intervalMonths: z.number().int().min(1).max(24).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => parseDayKey(value) !== null, "Ungültiges Datum")
    .optional()
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = UpdateInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.recurringTransaction.findFirst({
    where: { id: params.id, account: { householdId: user.householdId } }
  });
  if (!existing) {
    return NextResponse.json({ error: "Recurring transaction not found" }, { status: 404 });
  }

  const data = parsed.data;
  if (data.accountId) {
    const account = await prisma.account.findFirst({ where: { id: data.accountId, householdId: user.householdId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
  }

  if (data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, householdId: user.householdId } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }

  // nextOccurrence neu bestimmen: ein explizites startDate setzt die Serie neu auf. Ein
  // geändertes dayOfMonth allein verschiebt nur den Tag im bestehenden Anker-Monat — die
  // Fälligkeit rechnet ohnehin nur mit dem Anker-MONAT, so bleibt die Phase der Serie.
  const startDay = data.startDate ? parseDayKey(data.startDate) : null;
  const resolvedDayOfMonth = data.dayOfMonth ?? startDay?.day;
  let firstDay: CalendarDate | undefined;
  if (startDay) {
    firstDay = startDay;
  } else if (data.dayOfMonth !== undefined) {
    firstDay = occurrenceDate(zonedMonth(existing.nextOccurrence), data.dayOfMonth);
  }
  // 12:00 Uhr Berliner Zeit: in Berlin und in UTC derselbe Kalendertag.
  const nextOccurrence = firstDay ? zonedTimeToUtc({ ...firstDay, hour: 12 }) : undefined;

  const updateData = {
    accountId: data.accountId,
    categoryId: data.categoryId ?? undefined,
    amountCents: data.amountCents,
    description: data.description,
    intervalMonths: data.intervalMonths,
    dayOfMonth: resolvedDayOfMonth,
    nextOccurrence
  } as Prisma.RecurringTransactionUncheckedUpdateInput;

  const updated = await prisma.recurringTransaction.update({
    where: { id: params.id },
    data: updateData
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.recurringTransaction.findFirst({
    where: { id: params.id, account: { householdId: user.householdId } }
  });
  if (!existing) {
    return NextResponse.json({ error: "Recurring transaction not found" }, { status: 404 });
  }

  // Soft-Delete (Phase 3b): Tombstone statt Hard-Delete für die Sync-Propagation.
  await prisma.recurringTransaction.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  return new NextResponse(null, { status: 204 });
}
