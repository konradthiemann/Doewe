import { ensureNonEmpty } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const SavingPlanInput = z.object({
  accountId: z.string().min(1),
  title: z
    .string()
    .transform((value) => ensureNonEmpty(value))
    .transform((value) => value.trim()),
  targetMonth: z.number().int().min(1).max(12),
  targetYear: z.number().int().min(1970).max(9999),
  amountCents: z.number().int().min(1)
});

function normalizeTitle({
  title,
  categoryName,
  month,
  year
}: {
  title: string | null | undefined;
  categoryName: string | null | undefined;
  month: number;
  year: number;
}) {
  const trimmed = title?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (categoryName) {
    return categoryName;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function resolveSavingsBalanceCents(accountId: string, userId: string) {
  const savingsCategory = await prisma.category.findFirst({
    where: { name: "Savings", userId },
    select: { id: true }
  });

  if (!savingsCategory) {
    return 0;
  }

  const savingsTransactions = await prisma.transaction.findMany({
    where: { accountId, categoryId: savingsCategory.id },
    select: { amountCents: true }
  });

  return savingsTransactions.reduce((total, tx) => total - tx.amountCents, 0);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.account.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!account) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  const accountId = account.id;

  const [goalsRaw, availableCents] = await Promise.all([
    prisma.budget.findMany({
      where: { accountId },
      orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
      include: { category: { select: { name: true } } }
    }),
    resolveSavingsBalanceCents(accountId, user.id)
  ]);

  const goals = goalsRaw.map((goal) => ({
    id: goal.id,
    accountId: goal.accountId,
    categoryId: goal.categoryId,
    categoryName: goal.category?.name ?? null,
    title: normalizeTitle({
      title: goal.title,
      categoryName: goal.category?.name,
      month: goal.month,
      year: goal.year
    }),
    month: goal.month,
    year: goal.year,
    amountCents: goal.amountCents,
    createdAt: goal.createdAt
  }));

  const totalTargetCents = goals.reduce((sum, goal) => sum + goal.amountCents, 0);

  return NextResponse.json({
    goals,
    totals: {
      availableCents,
      totalTargetCents
    }
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = SavingPlanInput.safeParse({
    ...json,
    targetMonth: json?.targetMonth ?? json?.month ?? json?.dueMonth,
    targetYear: json?.targetYear ?? json?.year ?? json?.dueYear
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  const account = await prisma.account.findFirst({ where: { id: payload.accountId, userId: user.id } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const created = await prisma.budget.create({
    data: {
      accountId: payload.accountId,
      categoryId: null,
      title: payload.title,
      month: payload.targetMonth,
      year: payload.targetYear,
      amountCents: payload.amountCents
    }
  });

  return NextResponse.json(created, { status: 201 });
}
