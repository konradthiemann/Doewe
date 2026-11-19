/**
 * PATCH  /api/recurring-transactions/[id] — Dauerauftrag ändern
 * DELETE /api/recurring-transactions/[id] — Dauerauftrag löschen (Soft-Delete)
 *
 * Haushaltsbezogen (401 ohne Session, 404 außerhalb des eigenen Haushalts).
 *
 * Der Anker `nextOccurrence` wird nur angefasst, wenn `startDate` oder `dayOfMonth` im Body
 * steht, und immer als 12:00 Uhr Berliner Zeit des gemeinten Kalendertags gespeichert:
 * - `startDate` (yyyy-mm-dd, hat Vorrang) setzt die Serie neu auf: dieses Datum ist der
 *   Anker. Anders als beim Anlegen wird er nicht in den Folgemonat geschoben, wenn
 *   `dayOfMonth` vor dem Tag des Startdatums liegt — das Bearbeiten-Formular schickt den
 *   gespeicherten Anker mit, und der darf einen anderen Tag haben als `dayOfMonth`.
 * - `dayOfMonth` allein ändert nur den Tag: der Anker-Monat bleibt, der Tag wird auf die
 *   Länge dieses Monats begrenzt. Die Serie wird dadurch NICHT neu aufgesetzt — bei einem
 *   Intervall über 1 bleiben die fälligen Monate dieselben, und kein früherer Monat fällt
 *   aus der Jahresübersicht.
 * Bereits gebuchte Vorkommen bleiben in beiden Fällen unberührt.
 *
 * Kein ungefragtes Nachbuchen: Ändert die Anfrage den Rhythmus — ein `startDate`, das vom
 * gespeicherten Anker-Tag abweicht, oder ein `intervalMonths`, das vom gespeicherten Wert
 * abweicht —, wird `bookFromPeriod` neu bestimmt wie beim Anlegen: liegt der Anker in einem
 * Monat vor dem laufenden Berliner Monat, wird ab dem laufenden Monat gebucht (die Monate
 * davor nicht). `backfill: true` hebt die Untergrenze immer auf — auch ohne Änderung am
 * Rhythmus: Die vergangenen Monate seit dem Anker werden dann nachgebucht. Eine Anfrage ohne
 * `backfill: true`, die den Rhythmus nicht ändert, lässt `bookFromPeriod` unverändert.
 *
 * Ein geändertes `startDate` darf höchstens 10 Jahre vor oder nach heute liegen (400 sonst).
 * Der unverändert mitgeschickte Anker eines älteren Dauerauftrags wird nicht geprüft.
 *
 * PATCH Body: { accountId?, categoryId? (null erlaubt), amountCents?, description?, intervalMonths? (1-24), dayOfMonth? (1-31), startDate? (yyyy-mm-dd), backfill? (boolean) }
 */
import {
  RECURRING_START_MAX_YEARS,
  bookFromPeriodFor,
  calendarDaysBetween,
  isWithinYearsOf,
  occurrenceDate,
  parseDayKey,
  zonedDate,
  zonedMonth,
  zonedTimeToUtc,
  type CalendarDate
} from "@doewe/shared";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { freezePastMonths } from "../../../../lib/categoryBudgets";
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
    .optional(),
  backfill: z.boolean().optional()
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
  const now = new Date();

  // The schedule changes when the start date moves away from the stored anchor
  // day or the interval differs. The edit form resends both unchanged on every
  // save; that must neither re-validate an old anchor nor move the lower bound.
  const startDay = data.startDate ? parseDayKey(data.startDate) : null;
  const startChanged =
    startDay !== null && calendarDaysBetween(zonedDate(existing.nextOccurrence), startDay) !== 0;
  const intervalChanged = data.intervalMonths !== undefined && data.intervalMonths !== existing.intervalMonths;

  if (startDay && startChanged && !isWithinYearsOf(startDay, zonedDate(now))) {
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
  const resolvedDayOfMonth = data.dayOfMonth ?? startDay?.day;
  let firstDay: CalendarDate | undefined;
  if (startDay) {
    firstDay = startDay;
  } else if (data.dayOfMonth !== undefined) {
    firstDay = occurrenceDate(zonedMonth(existing.nextOccurrence), data.dayOfMonth);
  }
  // 12:00 Uhr Berliner Zeit: in Berlin und in UTC derselbe Kalendertag.
  const nextOccurrence = firstDay ? zonedTimeToUtc({ ...firstDay, hour: 12 }) : undefined;

  // A changed schedule must not back-book unasked: with an anchor before the
  // current month the series is booked from the current month on, unless the
  // user asked for the months in between. undefined = leave the bound alone.
  // An explicit `backfill: true` always lifts the bound: it is the user asking
  // for the past months, whether or not the schedule changes in this request.
  let bookFromPeriod: string | null | undefined;
  if (data.backfill === true) {
    bookFromPeriod = null;
  } else if (startChanged || intervalChanged) {
    bookFromPeriod = bookFromPeriodFor(zonedMonth(nextOccurrence ?? existing.nextOccurrence), zonedMonth(now), false);
  }

  const updateData = {
    accountId: data.accountId,
    // undefined = unchanged, null = remove the category
    categoryId: data.categoryId,
    amountCents: data.amountCents,
    description: data.description,
    intervalMonths: data.intervalMonths,
    dayOfMonth: resolvedDayOfMonth,
    nextOccurrence,
    bookFromPeriod
  } as Prisma.RecurringTransactionUncheckedUpdateInput;

  // Freeze the budgets of past months first: a YEARLY plan is distributed by
  // the standing orders, so changing one would otherwise change old months.
  await freezePastMonths(user.householdId);
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
  // Freeze the budgets of past months first: a YEARLY plan is distributed by
  // the standing orders, so changing one would otherwise change old months.
  await freezePastMonths(user.householdId);
  await prisma.recurringTransaction.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  return new NextResponse(null, { status: 204 });
}
