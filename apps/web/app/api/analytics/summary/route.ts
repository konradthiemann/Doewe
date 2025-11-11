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

  // Resolve special category for savings (if present)
  const savingsCategory = await prisma.category.findFirst({
    where: { name: "Savings" },
    select: { id: true }
  });
  const savingsCatId = savingsCategory?.id ?? null;

  // Get all transactions for the month for the account
  const txs = await prisma.transaction.findMany({
    where: {
      accountId,
      occurredAt: { gte: start, lt: end }
    },
    select: { amountCents: true, categoryId: true, occurredAt: true }
  });

  // Sum income/outcome and bucket outcomes by categoryId
  let incomeTotal = 0;
  let outcomeTotalExclSavings = 0;
  let monthlySavingsActual = 0; // only savings transfers in the current month
  const byCategory: Record<string, number> = {};
  for (const t of txs) {
    const amt = t.amountCents / 100;
    if (amt >= 0) incomeTotal += amt;
    else {
      const abs = -amt;
      // Savings transactions are tracked separately and excluded from category breakdown
      if (t.categoryId && savingsCatId && t.categoryId === savingsCatId) {
        monthlySavingsActual += abs;
      } else {
        outcomeTotalExclSavings += abs;
        const key = t.categoryId ?? "uncategorized";
        byCategory[key] = (byCategory[key] ?? 0) + abs;
      }
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

  // Planned savings (Budget with categoryId null) for current month only
  const { month, year } = getMonthYear(now);
  const plannedBudget = await prisma.budget.findFirst({
    where: { accountId, categoryId: null, month, year },
    select: { amountCents: true }
  });
  const plannedSavings = plannedBudget ? plannedBudget.amountCents / 100 : 0;

  // Remaining cash after non-savings outgoings and savings transfers
  const remaining = incomeTotal - outcomeTotalExclSavings - monthlySavingsActual;

  // Build daily cumulative lines (income, outcome excl savings, global savings adjusted)
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDay = Array.from({ length: daysInMonth }, () => ({ inc: 0, out: 0, sav: 0 }));
  for (const t of txs) {
    const day = t.occurredAt.getDate();
    const idx = day - 1;
    const amt = t.amountCents / 100;
    if (amt >= 0) {
      byDay[idx].inc += amt;
    } else if (savingsCatId && t.categoryId === savingsCatId) {
      byDay[idx].sav += -amt; // savings are positive for accumulation
    } else {
      byDay[idx].out += -amt; // outgoings are positive for charting
    }
  }

  // Baseline global savings: sum of all savings transactions before current month
  let baselineSavings = 0;
  if (savingsCatId) {
    const prevSavings = await prisma.transaction.findMany({
      where: {
        accountId,
        categoryId: savingsCatId,
        occurredAt: { lt: start }
      },
      select: { amountCents: true }
    });
    for (const t of prevSavings) {
      const amt = t.amountCents / 100;
      if (amt < 0) baselineSavings += -amt; // accumulate only transfers to savings
    }
  }

  const incomeDaily: number[] = new Array(daysInMonth).fill(0);
  const outcomeDaily: number[] = new Array(daysInMonth).fill(0);
  const savingsDaily: number[] = new Array(daysInMonth).fill(0);
  let incRun = 0;
  let outRun = 0;
  let savRun = baselineSavings;
  for (let i = 0; i < daysInMonth; i++) {
    incRun += byDay[i].inc;
    outRun += byDay[i].out;
    savRun += byDay[i].sav; // add savings transfers
    const deficit = Math.max(0, outRun - incRun);
    const adjustedSavings = Math.max(0, savRun - deficit);
    incomeDaily[i] = incRun;
    outcomeDaily[i] = outRun;
    savingsDaily[i] = adjustedSavings;
  }

  return NextResponse.json({
    incomeTotal,
    outcomeTotal: outcomeTotalExclSavings,
    outcomeTotalExclSavings,
    monthlySavingsActual,
    remaining,
    plannedSavings,
    outgoingByCategory,
    daily: {
      labels: Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`),
      income: incomeDaily,
      outcome: outcomeDaily,
      savings: savingsDaily
    }
  });
}
