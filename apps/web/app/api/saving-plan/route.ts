import { ensureNonEmpty } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

import { computeSavingPlanTotals } from "./compute";

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

/**
 * Savings category names recognised by the system (EN / DE).
 * The lookup is case-insensitive so "savings", "Savings", "Sparen" etc. all match.
 */
const SAVINGS_CATEGORY_NAMES = ["savings", "sparen"];

async function findSavingsCategoryId(userId: string): Promise<string | null> {
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true }
  });
  const match = categories.find((c) =>
    SAVINGS_CATEGORY_NAMES.includes(c.name.toLowerCase().trim())
  );
  return match?.id ?? null;
}

async function resolveSavingsBalanceCents(accountId: string, userId: string) {
  const savingsCatId = await findSavingsCategoryId(userId);

  if (!savingsCatId) {
    return 0;
  }

  const savingsTransactions = await prisma.transaction.findMany({
    where: { accountId, categoryId: savingsCatId },
    select: { amountCents: true }
  });

  // Savings transfers are stored as negative amounts (outgoing expense).
  // Negate them to get the positive savings balance.
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

  // Active goals drive the forward-looking plan; completed goals are kept for history.
  const goals = goalsRaw.filter((goal) => goal.completedAt == null).map(mapGoal);
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
      month: payload.targetMonth,
      year: payload.targetYear,
      amountCents: payload.amountCents
    }
  });

  return NextResponse.json(created, { status: 201 });
}
