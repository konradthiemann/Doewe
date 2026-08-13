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
    .refine(isRealCalendarDate, "Ungültiges Datum")
    .optional()
});

function nextOccurrenceDate(dayOfMonth: number, now = new Date()) {
  const today = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  if (dayOfMonth > today) {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const clampedDay = Math.min(dayOfMonth, daysInMonth);
    return new Date(currentYear, currentMonth, clampedDay, 0, 0, 0, 0);
  }
  
  const nextMonth = currentMonth + 1;
  const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
  const normalizedMonth = nextMonth % 12;
  const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
  const clampedDay = Math.min(dayOfMonth, daysInNextMonth);
  return new Date(nextYear, normalizedMonth, clampedDay, 0, 0, 0, 0);
}

/** Prüft, ob ein `yyyy-mm-dd`-String ein gültiges Kalenderdatum ist. */
function isRealCalendarDate(startDate: string): boolean {
  const [year, month, day] = startDate.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

/**
 * Wandelt einen `yyyy-mm-dd`-String in ein lokales Date (Mitternacht) um.
 * Der Tag wird defensiv auf den letzten Tag des Monats geclampt.
 */
function startDateToDate(startDate: string): Date {
  const [year, month, day] = startDate.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, daysInMonth);
  return new Date(year, month - 1, clampedDay, 0, 0, 0, 0);
}

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

  // nextOccurrence neu bestimmen: ein explizites startDate hat Vorrang; sonst wird
  // (wie bisher) aus einem geänderten dayOfMonth neu berechnet.
  const resolvedDayOfMonth =
    data.dayOfMonth ?? (data.startDate ? Number(data.startDate.slice(8, 10)) : undefined);
  let nextOccurrence: Date | undefined;
  if (data.startDate) {
    nextOccurrence = startDateToDate(data.startDate);
  } else if (data.dayOfMonth !== undefined) {
    nextOccurrence = nextOccurrenceDate(data.dayOfMonth);
  }

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

  await prisma.recurringTransaction.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
