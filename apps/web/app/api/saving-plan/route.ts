import { ensureNonEmpty } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

import { computeSavingPlanTotals } from "./compute";
import { resolveSavingsBalanceCents } from "./savings";

const SavingPlanInput = z
  .object({
    accountId: z.string().min(1),
    title: z
      .string()
      .transform((value) => ensureNonEmpty(value))
      .transform((value) => value.trim()),
    // Undated goals omit month/year; amount is optional for idea-backlog goals.
    targetMonth: z.number().int().min(1).max(12).nullish(),
    targetYear: z.number().int().min(1970).max(9999).nullish(),
    amountCents: z.number().int().min(1).nullish()
  })
  .refine((data) => (data.targetMonth == null) === (data.targetYear == null), {
    message: "targetMonth and targetYear must both be provided or both omitted",
    path: ["targetMonth"]
  });

function normalizeTitle({
  title,
  categoryName,
  month,
  year
}: {
  title: string | null | undefined;
  categoryName: string | null | undefined;
  month: number | null;
  year: number | null;
}) {
  const trimmed = title?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (categoryName) {
    return categoryName;
  }
  if (month != null && year != null) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  return "";
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
      include: {
        category: { select: { name: true } },
        transactions: { select: { amountCents: true } }
      }
    }),
    resolveSavingsBalanceCents(accountId, user.id)
  ]);

  const mapGoal = (goal: (typeof goalsRaw)[number]) => ({
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
    transactionSpentCents: goal.transactions.reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0),
    completedAt: goal.completedAt,
    spentCents: goal.spentCents,
    createdAt: goal.createdAt
  });

  // Active, dated goals drive the forward-looking plan (timeline).
  // Active, undated goals are an idea backlog shown separately.
  // Completed goals are kept for history.
  const activeRaw = goalsRaw.filter((goal) => goal.completedAt == null);
  const goals = activeRaw.filter((goal) => goal.month != null && goal.year != null).map(mapGoal);
  const undatedGoals = activeRaw.filter((goal) => goal.month == null || goal.year == null).map(mapGoal);
  const completedGoals = goalsRaw.filter((goal) => goal.completedAt != null).map(mapGoal);

  // `availableCents` from resolveSavingsBalanceCents is the raw savings balance.
  // computeSavingPlanTotals reserves the amount withdrawn for completed goals out of it.
  const totals = computeSavingPlanTotals(
    goalsRaw.map((goal) => ({
      amountCents: goal.amountCents,
      completedAt: goal.completedAt,
      spentCents: goal.spentCents,
      month: goal.month,
      year: goal.year
    })),
    availableCents,
    new Date()
  );

  return NextResponse.json({
    goals,
    undatedGoals,
    completedGoals,
    totals
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
      month: payload.targetMonth ?? null,
      year: payload.targetYear ?? null,
      amountCents: payload.amountCents ?? null
    }
  });

  return NextResponse.json(created, { status: 201 });
}
