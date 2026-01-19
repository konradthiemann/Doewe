import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

type RecurringSkipDelegate = {
  findMany: (args: unknown) => Promise<Array<{ recurringId: string; year: number; month: number }>>;
  upsert: (args: unknown) => Promise<{ recurringId: string; year: number; month: number }>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
};

const prismaSkip = prisma as unknown as { recurringTransactionSkip: RecurringSkipDelegate };

const SkipInput = z.object({
  recurringId: z.string().min(1),
  year: z.number().int().min(1970).max(9999),
  month: z.number().int().min(1).max(12)
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!year || !month) {
    return NextResponse.json({ error: "Missing year or month" }, { status: 400 });
  }

  const items = await prismaSkip.recurringTransactionSkip.findMany({
    where: {
      year,
      month,
      recurring: { account: { userId: user.id } }
    },
    select: { recurringId: true, year: true, month: true }
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = SkipInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { recurringId, year, month } = parsed.data;
  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id: recurringId, account: { userId: user.id } }
  });
  if (!recurring) {
    return NextResponse.json({ error: "Recurring transaction not found" }, { status: 404 });
  }

  const created = await prismaSkip.recurringTransactionSkip.upsert({
    where: { recurringId_year_month: { recurringId, year, month } },
    update: {},
    create: { recurringId, year, month }
  });

  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = SkipInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { recurringId, year, month } = parsed.data;
  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id: recurringId, account: { userId: user.id } }
  });
  if (!recurring) {
    return NextResponse.json({ error: "Recurring transaction not found" }, { status: 404 });
  }

  await prismaSkip.recurringTransactionSkip.deleteMany({
    where: { recurringId, year, month }
  });

  return new NextResponse(null, { status: 204 });
}
