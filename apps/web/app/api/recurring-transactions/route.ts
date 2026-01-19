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
  intervalMonths: z.number().int().min(1).max(24).optional()
});

function firstOfNextMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.recurringTransaction.findMany({
    where: { account: { userId: user.id } },
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
  const nextDate = firstOfNextMonth();

  const account = await prisma.account.findFirst({ where: { id: data.accountId, userId: user.id } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: data.categoryId, userId: user.id } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }
  const createData = {
    accountId: data.accountId,
    categoryId: data.categoryId,
    amountCents: data.amountCents,
    description: data.description,
    frequency: "MONTHLY",
    intervalMonths: data.intervalMonths ?? 1,
    nextOccurrence: nextDate
  } as Prisma.RecurringTransactionUncheckedCreateInput;

  const created = await prisma.recurringTransaction.create({
    data: createData
  });
  return NextResponse.json(created, { status: 201 });
}
