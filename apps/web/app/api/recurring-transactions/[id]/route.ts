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
  dayOfMonth: z.number().int().min(1).max(31).optional()
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = UpdateInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.recurringTransaction.findFirst({
    where: { id: params.id, account: { userId: user.id } }
  });
  if (!existing) {
    return NextResponse.json({ error: "Recurring transaction not found" }, { status: 404 });
  }

  const data = parsed.data;
  if (data.accountId) {
    const account = await prisma.account.findFirst({ where: { id: data.accountId, userId: user.id } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
  }

  if (data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, userId: user.id } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }

  // Recalculate nextOccurrence if dayOfMonth changes
  const newDayOfMonth = data.dayOfMonth;
  let nextOccurrence: Date | undefined;
  if (newDayOfMonth !== undefined) {
    nextOccurrence = nextOccurrenceDate(newDayOfMonth);
  }

  const updateData = {
    accountId: data.accountId,
    categoryId: data.categoryId ?? undefined,
    amountCents: data.amountCents,
    description: data.description,
    intervalMonths: data.intervalMonths,
    dayOfMonth: newDayOfMonth,
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
    where: { id: params.id, account: { userId: user.id } }
  });
  if (!existing) {
    return NextResponse.json({ error: "Recurring transaction not found" }, { status: 404 });
  }

  await prisma.recurringTransaction.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
