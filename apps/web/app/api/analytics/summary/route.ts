import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";

function getMonthYear(date = new Date()) {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

export async function GET() {
  // For now, assume single demo account
  const accountId = "acc_demo";
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Get all transactions for the month for the account
  const txs = await prisma.transaction.findMany({
    where: {
      accountId,
      occurredAt: { gte: start, lt: end }
    },
    select: { amountCents: true, categoryId: true }
  });

  // Sum income/outcome and bucket outcomes by categoryId
  let incomeTotal = 0;
  let outcomeTotal = 0;
  const byCategory: Record<string, number> = {};
  for (const t of txs) {
    const amt = t.amountCents / 100;
    if (amt >= 0) incomeTotal += amt;
    else {
      const abs = -amt;
      outcomeTotal += abs;
      const key = t.categoryId ?? "uncategorized";
      byCategory[key] = (byCategory[key] ?? 0) + abs;
    }
  }

  // Resolve category names
  const catIds = Object.keys(byCategory).filter((id) => id !== "uncategorized");
  const categories = await prisma.category.findMany({
    where: { id: { in: catIds } },
    select: { id: true, name: true }
  });
  const nameMap: Record<string, string> = {};
  for (const c of categories) nameMap[c.id] = c.name;

  const outgoingByCategory = Object.entries(byCategory).map(([id, amount]) => ({
    id,
    name: id === "uncategorized" ? "Uncategorized" : nameMap[id] ?? id,
    amount
  }));

  // Planned savings (Budget with categoryId null)
  const { month, year } = getMonthYear(now);
  const plannedBudget = await prisma.budget.findFirst({
    where: { accountId, categoryId: null, month, year },
    select: { amountCents: true }
  });
  const plannedSavings = plannedBudget ? plannedBudget.amountCents / 100 : 0;

  const remaining = incomeTotal - outcomeTotal;
  const actualSavings = Math.max(0, remaining);

  return NextResponse.json({
    incomeTotal,
    outcomeTotal,
    remaining,
    plannedSavings,
    actualSavings,
    outgoingByCategory
  });
}
