/**
 * GET /api/analytics/monthly-review?month=X&year=Y
 *
 * Liefert eine vollständige Rückschau auf einen abgeschlossenen Monat:
 *
 * - `month`, `year`            — Der abgefragte Monat (Standard: Vormonat)
 * - `incomeCents`              — Summe aller Einnahmen des Monats
 * - `outcomeCents`             — Summe aller Ausgaben (ohne Sparbuchungen)
 * - `savingsCents`             — Tatsächliche Sparbuchungen des Monats
 * - `balanceAtStartCents`      — Kontostand am Monatsanfang (Übertrag)
 * - `balanceAtEndCents`        — Kontostand am Monatsende
 * - `savingsRatePct`           — Sparquote in % (savingsCents / incomeCents)
 * - `categories`               — Ausgaben je Kategorie inkl. Budget-Vergleich
 * - `topExpenses`              — Die 5 größten Einzelausgaben des Monats
 * - `prevMonth`                — Basiswerte des Vormonats für MoM-Vergleich
 * - `availableMonths`          — Alle Monate mit Transaktionen (neueste zuerst)
 *
 * Query-Params:
 *   month (1–12, optional) — Default: letzter abgeschlossener Monat
 *   year  (4-stellig, optional)
 *
 * Der aktuelle Monat kann nicht abgefragt werden (nicht abgeschlossen).
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.account.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" }
  });
  if (!account) return NextResponse.json({ error: "No account found for user" }, { status: 404 });

  const accountId = account.id;
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Default: last completed month
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = prevMonthDate.getMonth() + 1;
  const defaultYear = prevMonthDate.getFullYear();

  let month = searchParams.get("month") ? parseInt(searchParams.get("month")!, 10) : defaultMonth;
  let year = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : defaultYear;

  // Never allow current or future months — clamp to last completed month
  if (
    isNaN(month) || isNaN(year) ||
    year > currentYear ||
    (year === currentYear && month >= currentMonth)
  ) {
    month = defaultMonth;
    year = defaultYear;
  }

  // Resolve savings category (consistent with summary + quarterly routes)
  const SAVINGS_NAMES = ["savings", "sparen"];
  const savingsCategory = await prisma.category.findFirst({
    where: { userId: user.id, name: { in: SAVINGS_NAMES, mode: "insensitive" } },
    select: { id: true }
  });
  const savingsCatId = savingsCategory?.id ?? null;

  // Month boundaries
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  // Previous month for MoM comparison
  const prevDate = new Date(year, month - 2, 1);
  const prevMonthNum = prevDate.getMonth() + 1;
  const prevYearNum = prevDate.getFullYear();
  const prevMonthStart = new Date(prevYearNum, prevMonthNum - 1, 1);

  // Single query: both selected month + previous month transactions
  const txs = await prisma.transaction.findMany({
    where: { accountId, occurredAt: { gte: prevMonthStart, lt: monthEnd } },
    select: {
      amountCents: true,
      categoryId: true,
      occurredAt: true,
      description: true
    },
    orderBy: { amountCents: "asc" } // most negative first — enables O(1) top-expenses extraction
  });

  const monthStartMs = monthStart.getTime();
  const monthEndMs = monthEnd.getTime();
  const prevMonthStartMs = prevMonthStart.getTime();
  const prevMonthEndMs = monthStart.getTime();

  let incomeCents = 0;
  let outcomeCents = 0;
  let savingsCents = 0;
  let prevIncomeCents = 0;
  let prevOutcomeCents = 0;
  let prevSavingsCents = 0;
  const byCategoryCents: Record<string, { spentCents: number; count: number }> = {};

  for (const tx of txs) {
    const tMs = tx.occurredAt.getTime();
    const isCurrent = tMs >= monthStartMs && tMs < monthEndMs;
    const isPrev = tMs >= prevMonthStartMs && tMs < prevMonthEndMs;
    const amt = tx.amountCents;
    const isSavings = savingsCatId !== null && tx.categoryId === savingsCatId;

    if (isCurrent) {
      if (amt >= 0) {
        incomeCents += amt;
      } else if (isSavings) {
        savingsCents += -amt;
      } else {
        outcomeCents += -amt;
        const key = tx.categoryId ?? "uncategorized";
        if (!byCategoryCents[key]) byCategoryCents[key] = { spentCents: 0, count: 0 };
        byCategoryCents[key].spentCents += -amt;
        byCategoryCents[key].count += 1;
      }
    } else if (isPrev) {
      if (amt >= 0) {
        prevIncomeCents += amt;
      } else if (isSavings) {
        prevSavingsCents += -amt;
      } else {
        prevOutcomeCents += -amt;
      }
    }
  }

  // Balance at start of selected month (all transactions before month start)
  const balanceAtStartAgg = await prisma.transaction.aggregate({
    where: { accountId, occurredAt: { lt: monthStart } },
    _sum: { amountCents: true }
  });
  const balanceAtStartCents = balanceAtStartAgg._sum.amountCents ?? 0;
  const balanceAtEndCents = balanceAtStartCents + incomeCents - outcomeCents - savingsCents;

  // Budgets for selected month
  const budgets = await prisma.budget.findMany({
    where: { accountId, categoryId: { not: null }, month, year },
    select: { categoryId: true, amountCents: true }
  });
  const budgetMap: Record<string, number> = {};
  for (const b of budgets) {
    if (b.categoryId) budgetMap[b.categoryId] = b.amountCents;
  }

  // Resolve category names for all relevant IDs
  const catIds = Array.from(
    new Set([
      ...Object.keys(byCategoryCents).filter((id) => id !== "uncategorized"),
      ...Object.keys(budgetMap)
    ])
  );
  const catRows = await prisma.category.findMany({
    where: { id: { in: catIds }, userId: user.id },
    select: { id: true, name: true }
  });
  const catNameMap: Record<string, string> = {};
  for (const c of catRows) catNameMap[c.id] = c.name;

  // Build unified category list (spent + budget merged)
  const allCatIds = new Set([
    ...Object.keys(byCategoryCents).filter((id) => id !== "uncategorized"),
    ...Object.keys(budgetMap)
  ]);

  const categoryList: Array<{
    id: string;
    name: string;
    spentCents: number;
    budgetCents: number | null;
    transactionCount: number;
  }> = Array.from(allCatIds)
    .map((id) => ({
      id,
      name: catNameMap[id] ?? id,
      spentCents: byCategoryCents[id]?.spentCents ?? 0,
      budgetCents: (budgetMap[id] as number | undefined) ?? null,
      transactionCount: byCategoryCents[id]?.count ?? 0
    }))
    .sort((a, b) => {
      // Over-budget categories first, then by spend descending
      const aOver = a.budgetCents !== null && a.spentCents > a.budgetCents;
      const bOver = b.budgetCents !== null && b.spentCents > b.budgetCents;
      if (aOver && !bOver) return -1;
      if (!aOver && bOver) return 1;
      return b.spentCents - a.spentCents;
    });

  // Append uncategorized spend if present
  if (byCategoryCents["uncategorized"]) {
    categoryList.push({
      id: "uncategorized",
      name: "Uncategorized",
      spentCents: byCategoryCents["uncategorized"].spentCents,
      budgetCents: null,
      transactionCount: byCategoryCents["uncategorized"].count
    });
  }

  // Top 5 individual expenses — txs is pre-sorted by amountCents ASC (most negative first)
  const topExpenses = txs
    .filter((tx) => {
      const tMs = tx.occurredAt.getTime();
      return (
        tMs >= monthStartMs &&
        tMs < monthEndMs &&
        tx.amountCents < 0 &&
        !(savingsCatId !== null && tx.categoryId === savingsCatId)
      );
    })
    .slice(0, 5)
    .map((tx) => ({
      description: tx.description,
      amountCents: -tx.amountCents,
      categoryName: tx.categoryId ? (catNameMap[tx.categoryId] ?? null) : null,
      occurredAt: tx.occurredAt.toISOString()
    }));

  // Available months: from earliest transaction month up to (but not including) current month
  const earliestTx = await prisma.transaction.findFirst({
    where: { accountId },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true }
  });

  const availableMonths: Array<{ month: number; year: number }> = [];
  if (earliestTx) {
    const cursor = new Date(
      earliestTx.occurredAt.getFullYear(),
      earliestTx.occurredAt.getMonth(),
      1
    );
    const limit = new Date(currentYear, currentMonth - 1, 1); // start of current month
    while (cursor < limit) {
      availableMonths.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    availableMonths.reverse(); // most recent first
  }

  const savingsRatePct =
    incomeCents > 0
      ? Math.min(100, Math.round((savingsCents / incomeCents) * 100))
      : 0;

  const hasPrevData =
    prevIncomeCents > 0 || prevOutcomeCents > 0 || prevSavingsCents > 0;

  return NextResponse.json({
    month,
    year,
    incomeCents,
    outcomeCents,
    savingsCents,
    balanceAtStartCents,
    balanceAtEndCents,
    savingsRatePct,
    categories: categoryList,
    topExpenses,
    prevMonth: hasPrevData
      ? {
          month: prevMonthNum,
          year: prevYearNum,
          incomeCents: prevIncomeCents,
          outcomeCents: prevOutcomeCents,
          savingsCents: prevSavingsCents
        }
      : null,
    availableMonths
  });
}
