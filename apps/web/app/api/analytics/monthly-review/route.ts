/**
 * GET /api/analytics/monthly-review?month=X&year=Y
 *
 * Liefert eine vollständige Rückschau auf einen abgeschlossenen Monat (Kalender
 * Europe/Berlin, alle Konten des Haushalts, nur Gebuchtes — siehe
 * docs/calculations/00-grundregeln.md):
 *
 * - `month`, `year`            — Der abgefragte Monat (Standard: Vormonat)
 * - `incomeCents`              — Summe aller Einnahmen des Monats
 * - `outcomeCents`             — Summe aller Ausgaben (ohne Sparbuchungen)
 * - `savingsCents`             — Sparen des Monats, netto (Einzahlungen − Entnahmen,
 *                                kann negativ sein)
 * - `balanceAtStartCents`      — Kontostand am Monatsanfang (Übertrag = Summe aller
 *                                Buchungen vor Monatsbeginn)
 * - `balanceAtEndCents`        — Kontostand am Monatsende
 * - `savingsRatePct`           — Sparquote in % (savingsCents / incomeCents), auf 0–100
 *                                begrenzt
 * - `categories`               — Ausgaben je Kategorie inkl. Budget-Vergleich;
 *                                je Eintrag `transactions` (id, description, positiver
 *                                amountCents, occurredAt ISO, accountId, categoryId (null bei
 *                                unkategorisiert), taxRelevant) der Monatsausgaben, betrag
 *                                absteigend, bei Gleichstand Datum aufsteigend; ohne
 *                                Spar-Kategorien und Einnahmen; Budget-only: []. `budgetCents` =
 *                                effektives Budget (Budget-Plan, Vorrang vor einem
 *                                Monats-Budget des Monats)
 * - `incomeCategories`         — Einnahmen je Quelle/Kategorie (größte zuerst)
 * - `topExpenses`              — Die 5 größten Einzelausgaben des Monats
 * - `completedGoals`           — In diesem Monat als erledigt markierte Sparziele
 * - `completedGoalsSpentCents` — Summe der dafür entnommenen Beträge
 * - `prevMonth`                — Basiswerte des Vormonats für MoM-Vergleich
 * - `availableMonths`          — Alle Monate von der frühesten Buchung bis zum Vormonat
 *                                (neueste zuerst)
 *
 * Einordnung (classifyFlow): Buchungen in einer Spar-Kategorie (Name getrimmt, ohne
 * Beachtung der Groß-/Kleinschreibung "savings" oder "sparen"; mehrere möglich) sind
 * Sparen, alles andere nach Vorzeichen Einnahme (>= 0) oder Ausgabe (< 0).
 *
 * Query-Params (zod-validiert):
 *   month (ganze Zahl 1–12, optional) — Default: letzter abgeschlossener Monat
 *   year  (ganze Zahl 2000–2100, optional)
 *
 * Der aktuelle Monat und künftige Monate können nicht abgefragt werden (nicht
 * abgeschlossen); sie und ungültige Parameter (z. B. month=23) fallen auf den
 * Standard-Monat zurück. 404, wenn der Haushalt kein Konto hat.
 */
import {
  addFlow,
  classifyFlow,
  emptyFlowTotals,
  percentOf,
  shiftMonth,
  zonedMonth,
  zonedMonthRange,
  type MonthRef
} from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

import { getSessionUser } from "../../../../lib/auth";
import { loadEffectiveCategoryBudgets } from "../../../../lib/categoryBudgets";
import { prisma } from "../../../../lib/prisma";
import { catchUpPastRecurringForHousehold } from "../../../../lib/recurringBooking";
import { loadSavingsCategoryIds } from "../../../../lib/savingsCategory";

const MonthlyReviewQuery = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional()
});

type ReviewTx = {
  id: string;
  description: string;
  amountCents: number;
  occurredAt: string;
  accountId: string;
  categoryId: string | null;
  taxRelevant: boolean;
  recurringTransactionId: string | null;
};

/** Largest amount first; ties by date ascending. */
function byAmountDescThenDateAsc(a: ReviewTx, b: ReviewTx): number {
  return b.amountCents - a.amountCents || a.occurredAt.localeCompare(b.occurredAt);
}

function transactionsFor(byCategory: Record<string, ReviewTx[]>, id: string): ReviewTx[] {
  return [...(byCategory[id] ?? [])].sort(byAmountDescThenDateAsc);
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = user.householdId;
  const anyAccount = await prisma.account.findFirst({ where: { householdId }, select: { id: true } });
  if (!anyAccount) return NextResponse.json({ error: "No account found for user" }, { status: 404 });

  // All accounts of the household — the same scope as the transaction list.
  const inHousehold = { account: { householdId } };
  const { searchParams } = new URL(request.url);

  const now = new Date();

  // Selbstheilung: fällige, nie gebuchte Daueraufträge abgeschlossener Monate
  // nachbuchen, bevor gerechnet wird (siehe catchUpPastRecurringForHousehold).
  await catchUpPastRecurringForHousehold(householdId, now);

  // "Current month" in the app calendar (Europe/Berlin); default: last completed month
  const current = zonedMonth(now);
  const fallback = shiftMonth(current, -1);
  const isBeforeCurrent = (ref: MonthRef) =>
    ref.year < current.year || (ref.year === current.year && ref.month < current.month);

  // Invalid input (month=23, year=abc) and current or future months fall back
  // to the last completed month.
  const parsed = MonthlyReviewQuery.safeParse({
    month: searchParams.get("month") || undefined,
    year: searchParams.get("year") || undefined
  });
  const requested: MonthRef = parsed.success
    ? { month: parsed.data.month ?? fallback.month, year: parsed.data.year ?? fallback.year }
    : fallback;
  const { month, year } = isBeforeCurrent(requested) ? requested : fallback;

  const savingsIds = await loadSavingsCategoryIds(householdId);

  // Month boundaries, half-open [monthStart, monthEnd)
  const { start: monthStart, end: monthEnd } = zonedMonthRange(year, month);

  // Previous month for MoM comparison
  const { year: prevYearNum, month: prevMonthNum } = shiftMonth({ year, month }, -1);
  const { start: prevMonthStart } = zonedMonthRange(prevYearNum, prevMonthNum);

  // Single query: both selected month + previous month transactions
  const txs = await prisma.transaction.findMany({
    where: { ...inHousehold, occurredAt: { gte: prevMonthStart, lt: monthEnd } },
    select: {
      id: true,
      amountCents: true,
      categoryId: true,
      occurredAt: true,
      description: true,
      accountId: true,
      taxRelevant: true,
      recurringTransactionId: true
    },
    orderBy: { amountCents: "asc" } // most negative first — enables O(1) top-expenses extraction
  });

  // The query covers [prevMonthStart, monthEnd): a row before monthStart is last month's.
  const monthStartMs = monthStart.getTime();

  const selected = emptyFlowTotals();
  const previous = emptyFlowTotals();
  const byCategoryCents: Record<string, { spentCents: number; count: number }> = {};
  const txsByCategory: Record<string, ReviewTx[]> = {};
  const incomeByCategoryCents: Record<string, { amountCents: number; count: number }> = {};

  for (const tx of txs) {
    if (tx.occurredAt.getTime() < monthStartMs) {
      addFlow(previous, tx, savingsIds);
      continue;
    }

    const amt = tx.amountCents;
    const kind = addFlow(selected, tx, savingsIds);
    const key = tx.categoryId ?? "uncategorized";
    if (kind === "income") {
      if (!incomeByCategoryCents[key]) incomeByCategoryCents[key] = { amountCents: 0, count: 0 };
      incomeByCategoryCents[key].amountCents += amt;
      incomeByCategoryCents[key].count += 1;
    } else if (kind === "outcome") {
      if (!byCategoryCents[key]) byCategoryCents[key] = { spentCents: 0, count: 0 };
      byCategoryCents[key].spentCents += -amt;
      byCategoryCents[key].count += 1;
      (txsByCategory[key] ??= []).push({
        id: tx.id,
        description: tx.description,
        amountCents: -amt,
        occurredAt: tx.occurredAt.toISOString(),
        accountId: tx.accountId,
        categoryId: tx.categoryId,
        taxRelevant: tx.taxRelevant,
        recurringTransactionId: tx.recurringTransactionId
      });
    }
  }

  const { incomeCents, outcomeCents, savingsCents } = selected;
  const { incomeCents: prevIncomeCents, outcomeCents: prevOutcomeCents, savingsCents: prevSavingsCents } = previous;

  // Balance at start of selected month (all transactions before month start)
  const balanceAtStartAgg = await prisma.transaction.aggregate({
    where: { ...inHousehold, occurredAt: { lt: monthStart } },
    _sum: { amountCents: true }
  });
  const balanceAtStartCents = balanceAtStartAgg._sum.amountCents ?? 0;
  const balanceAtEndCents = balanceAtStartCents + incomeCents - outcomeCents - savingsCents;

  // Effective budgets for selected month (the plan; a per-month Budget only without a plan)
  const budgetMap = await loadEffectiveCategoryBudgets({ householdId, year, month });

  // Resolve category names for all relevant IDs
  const catIds = Array.from(
    new Set([
      ...Object.keys(byCategoryCents).filter((id) => id !== "uncategorized"),
      ...Object.keys(incomeByCategoryCents).filter((id) => id !== "uncategorized"),
      ...Object.keys(budgetMap)
    ])
  );
  const catRows = await prisma.category.findMany({
    where: { id: { in: catIds }, householdId },
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
    transactions: ReviewTx[];
  }> = Array.from(allCatIds)
    .map((id) => ({
      id,
      name: catNameMap[id] ?? id,
      spentCents: byCategoryCents[id]?.spentCents ?? 0,
      budgetCents: (budgetMap[id] as number | undefined) ?? null,
      transactionCount: byCategoryCents[id]?.count ?? 0,
      transactions: transactionsFor(txsByCategory, id)
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
      transactionCount: byCategoryCents["uncategorized"].count,
      transactions: transactionsFor(txsByCategory, "uncategorized")
    });
  }

  // Income breakdown by source (category), largest first
  const incomeCategoryList: Array<{
    id: string;
    name: string;
    amountCents: number;
    transactionCount: number;
  }> = Object.entries(incomeByCategoryCents)
    .map(([id, v]) => ({
      id,
      name: id === "uncategorized" ? "Uncategorized" : (catNameMap[id] ?? id),
      amountCents: v.amountCents,
      transactionCount: v.count
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  // Top 5 individual expenses — txs is pre-sorted by amountCents ASC (most negative first)
  const topExpenses = txs
    .filter((tx) => tx.occurredAt.getTime() >= monthStartMs && classifyFlow(tx, savingsIds) === "outcome")
    .slice(0, 5)
    .map((tx) => ({
      description: tx.description,
      amountCents: -tx.amountCents,
      categoryName: tx.categoryId ? (catNameMap[tx.categoryId] ?? null) : null,
      occurredAt: tx.occurredAt.toISOString()
    }));

  // Available months: from earliest transaction month up to (but not including) current month
  const earliestTx = await prisma.transaction.findFirst({
    where: inHousehold,
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true }
  });

  const availableMonths: Array<{ month: number; year: number }> = [];
  if (earliestTx) {
    for (let cursor = zonedMonth(earliestTx.occurredAt); isBeforeCurrent(cursor); cursor = shiftMonth(cursor, 1)) {
      availableMonths.push({ month: cursor.month, year: cursor.year });
    }
    availableMonths.reverse(); // most recent first
  }

  // Saving goals that were marked completed within the selected month.
  // Goals are budgets without a category; `spentCents` is the amount withdrawn on completion.
  const completedGoalsRaw = await prisma.budget.findMany({
    where: {
      ...inHousehold,
      categoryId: null,
      completedAt: { gte: monthStart, lt: monthEnd }
    },
    select: { title: true, amountCents: true, spentCents: true },
    orderBy: { completedAt: "asc" }
  });
  const completedGoals = completedGoalsRaw.map((g) => ({
    title: g.title,
    amountCents: g.amountCents,
    spentCents: g.spentCents ?? 0
  }));
  const completedGoalsSpentCents = completedGoals.reduce((sum, g) => sum + g.spentCents, 0);

  // Net savings can be negative (more withdrawn than deposited): the rate stays within 0–100.
  const savingsRatePct =
    incomeCents > 0
      ? Math.max(0, Math.min(100, percentOf(savingsCents, incomeCents)))
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
    incomeCategories: incomeCategoryList,
    topExpenses,
    completedGoals,
    completedGoalsSpentCents,
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
