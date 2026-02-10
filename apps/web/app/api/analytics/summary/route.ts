import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // avoid build-time prerender, always run at request time

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

function getMonthYear(date = new Date()) {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.account.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!account) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  const accountId = account.id;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // === NEW: Calculate total balance (all transactions ever) ===
  const allTransactions = await prisma.transaction.findMany({
    where: { accountId },
    select: { amountCents: true }
  });
  let totalBalanceCents = 0;
  for (const t of allTransactions) {
    totalBalanceCents += t.amountCents;
  }
  const totalBalance = totalBalanceCents / 100;

  // === NEW: Calculate carryover from last month (balance at end of previous month) ===
  const transactionsBeforeThisMonth = await prisma.transaction.findMany({
    where: { accountId, occurredAt: { lt: start } },
    select: { amountCents: true }
  });
  let carryoverCents = 0;
  for (const t of transactionsBeforeThisMonth) {
    carryoverCents += t.amountCents;
  }
  const carryoverFromLastMonth = carryoverCents / 100;

  // Resolve special category for savings (if present)
  const savingsCategory = await prisma.category.findFirst({
    where: { name: "Savings", userId: user.id },
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

  // Planned savings (Budget with categoryId null) for current month only
  const { month, year } = getMonthYear(now);
  const plannedBudgetAgg = await prisma.budget.aggregate({
    where: { accountId, categoryId: null, month, year },
    _sum: { amountCents: true }
  });
  const plannedSavings = (plannedBudgetAgg._sum.amountCents ?? 0) / 100;

  // === NEW: Fetch recurring transactions for current month ===
  const recurringTransactions = await prisma.recurringTransaction.findMany({
    where: { accountId },
    select: {
      id: true,
      amountCents: true,
      description: true,
      categoryId: true,
      intervalMonths: true,
      dayOfMonth: true,
      nextOccurrence: true
    }
  });

  // Filter recurring transactions that occur in current month
  const recurringThisMonth = recurringTransactions.filter((rec) => {
    const nextDate = new Date(rec.nextOccurrence);
    const nextYear = nextDate.getFullYear();
    const nextMonth = nextDate.getMonth() + 1;
    
    // Check if this recurring transaction occurs in current month
    if (nextYear === year && nextMonth === month) {
      return true;
    }
    
    // Check if transaction repeats and would occur in current month
    const interval = rec.intervalMonths || 1;
    const monthsSinceNext = (year - nextYear) * 12 + (month - nextMonth);
    return monthsSinceNext >= 0 && monthsSinceNext % interval === 0;
  });

  // Check for skips
  const skips = await prisma.recurringTransactionSkip.findMany({
    where: {
      recurringId: { in: recurringThisMonth.map((r) => r.id) },
      year,
      month
    },
    select: { recurringId: true }
  });
  const skippedIds = new Set(skips.map((s) => s.recurringId));

  // Filter out skipped transactions
  const activeRecurringThisMonth = recurringThisMonth.filter((r) => !skippedIds.has(r.id));

  // Calculate recurring transaction totals
  let recurringIncomeTotal = 0;
  let recurringOutcomeTotal = 0;
  const recurringByCategory: Record<string, number> = {};

  for (const rec of activeRecurringThisMonth) {
    const amt = rec.amountCents / 100;
    if (amt >= 0) {
      recurringIncomeTotal += amt;
    } else {
      const abs = -amt;
      recurringOutcomeTotal += abs;
      if (rec.categoryId && rec.categoryId !== savingsCatId) {
        const key = rec.categoryId;
        recurringByCategory[key] = (recurringByCategory[key] || 0) + abs;
      }
    }
  }

  // Remaining cash after non-savings outgoings and savings transfers
  const remaining = incomeTotal - outcomeTotalExclSavings - monthlySavingsActual;

  // Build daily cumulative lines (income, outcome excl savings, global savings adjusted)
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDay = Array.from({ length: daysInMonth }, () => ({ inc: 0, out: 0, sav: 0 }));
  
  // Add actual transactions
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

  // Add recurring transactions to their scheduled day
  for (const rec of activeRecurringThisMonth) {
    const day = Math.min(rec.dayOfMonth || 1, daysInMonth);
    const idx = day - 1;
    const amt = rec.amountCents / 100;
    if (amt >= 0) {
      byDay[idx].inc += amt;
    } else if (savingsCatId && rec.categoryId === savingsCatId) {
      byDay[idx].sav += -amt;
    } else {
      byDay[idx].out += -amt;
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

  // Projected totals including recurring transactions
  const projectedIncomeTotal = incomeTotal + recurringIncomeTotal;
  const projectedOutcomeTotal = outcomeTotalExclSavings + recurringOutcomeTotal;
  const projectedRemaining = projectedIncomeTotal - projectedOutcomeTotal - monthlySavingsActual;

  // Merge recurring transactions into category breakdown
  for (const [catId, amount] of Object.entries(recurringByCategory)) {
    byCategory[catId] = (byCategory[catId] || 0) + amount;
  }

  // Recalculate outgoingByCategory with recurring included
  const updatedCatIds = Object.keys(byCategory).filter((id) => id !== "uncategorized");
  const updatedCategories = await prisma.category.findMany({
    where: { id: { in: updatedCatIds }, userId: user.id },
    select: { id: true, name: true }
  });
  const updatedNameMap: Record<string, string> = {};
  for (const c of updatedCategories) updatedNameMap[c.id] = c.name;

  const finalOutgoingByCategory = Object.entries(byCategory).map(([id, amount]) => ({
    id,
    name: id === "uncategorized" ? "Uncategorized" : updatedNameMap[id] ?? id,
    amount
  }));

  return NextResponse.json({
    totalBalance,
    carryoverFromLastMonth,
    incomeTotal,
    outcomeTotal: outcomeTotalExclSavings,
    outcomeTotalExclSavings,
    monthlySavingsActual,
    remaining,
    plannedSavings,
    projectedIncomeTotal,
    projectedOutcomeTotal,
    projectedRemaining,
    outgoingByCategory: finalOutgoingByCategory,
    recurringTransactions: activeRecurringThisMonth.map((r) => ({
      id: r.id,
      description: r.description,
      amountCents: r.amountCents,
      categoryId: r.categoryId,
      dayOfMonth: r.dayOfMonth
    })),
    recurringIncomeTotal,
    recurringOutcomeTotal,
    daily: {
      labels: Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`),
      income: incomeDaily,
      outcome: outcomeDaily,
      savings: savingsDaily
    }
  });
}
