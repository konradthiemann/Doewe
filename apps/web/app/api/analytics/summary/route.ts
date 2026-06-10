/**
 * GET /api/analytics/summary
 *
 * Das Herzstück des Dashboards. Liefert alle Finanzdaten für den aktuellen Monat:
 *
 * - `totalBalance`          — Gesamtkontostand (alle Transaktionen aller Zeiten)
 * - `carryoverFromLastMonth`— Kontostand am Ende des Vormonats
 * - `incomeTotal`           — Summe aller tatsächlichen Einnahmen diesen Monat
 * - `outcomeTotal`          — Summe aller Ausgaben (ohne Sparbuchungen) diesen Monat
 * - `monthlySavingsActual`  — Tatsächliche Sparbuchungen diesen Monat
 * - `plannedSavings`        — Budget-Ziel ohne Kategorie (= Sparziel) für diesen Monat
 * - `projectedIncomeTotal`  — Hochrechnung inkl. noch nicht gebuchter Daueraufträge
 * - `projectedOutcomeTotal` — Hochrechnung Ausgaben inkl. Daueraufträge
 * - `projectedRemaining`    — Voraussichtlich verbleibendes Geld
 * - `outgoingByCategory`    — Ausgaben aufgeteilt nach Kategorien (inkl. Daueraufträge)
 * - `categoryBudgets`       — Budget vs. Ist pro Kategorie
 * - `recurringTransactions` — Aktive Daueraufträge für diesen Monat (nicht geskippt)
 * - `daily`                 — Tagesweise kumulierte Linien für das Chart (income, outcome, savings)
 *
 * Wichtig: Sparbudgets werden SEPARAT von normalen Ausgaben behandelt.
 * Eine Kategorie gilt als "Sparen" wenn ihr Name (lowercase) "savings" oder "sparen" enthält.
 * Sparbuchungen müssen einen negativen amountCents haben (Abgang vom Konto).
 *
 * Bekannte Einschränkung: Nur das erste Konto des Nutzers wird ausgewertet.
 * Multi-Account-Aggregation ist eine geplante zukünftige Erweiterung.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // Kein Build-Time-Prerendering — Daten sind nutzer- und zeitabhängig

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

/** Gibt Monat (1-12) und Jahr des übergebenen Datums zurück. Standard: heute. */
function getMonthYear(date = new Date()) {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // NOTE: Nur das erste Konto wird verwendet — Multi-Account ist eine bekannte zukünftige Erweiterung.
  const account = await prisma.account.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!account) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  const accountId = account.id;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Gesamtkontostand: DB berechnet die Summe direkt — kein Transfer aller Datensätze nötig
  const totalBalanceAgg = await prisma.transaction.aggregate({
    where: { accountId },
    _sum: { amountCents: true }
  });
  const totalBalance = (totalBalanceAgg._sum.amountCents ?? 0) / 100;

  // Carryover: Kontostand am Ende des Vormonats — gleiche Optimierung
  const carryoverAgg = await prisma.transaction.aggregate({
    where: { accountId, occurredAt: { lt: start } },
    _sum: { amountCents: true }
  });
  const carryoverFromLastMonth = (carryoverAgg._sum.amountCents ?? 0) / 100;

  // Spar-Kategorie auflösen — case-insensitive, EN + DE
  const SAVINGS_NAMES = ["savings", "sparen"];
  const allUserCategories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true }
  });
  const savingsCategory = allUserCategories.find((c) =>
    SAVINGS_NAMES.includes(c.name.toLowerCase().trim())
  );
  const savingsCatId = savingsCategory?.id ?? null;

  // Alle Transaktionen des aktuellen Monats
  const txs = await prisma.transaction.findMany({
    where: {
      accountId,
      occurredAt: { gte: start, lt: end }
    },
    select: { amountCents: true, categoryId: true, occurredAt: true }
  });

  // Alle Monats-Aggregationen in Integer-Cents — Floating-Point-Drift wird so verhindert
  let incomeTotalCents = 0;
  let outcomeTotalCents = 0;
  let monthlySavingsActualCents = 0;
  const byCategoryCents: Record<string, number> = {};

  for (const t of txs) {
    const amt = t.amountCents;
    if (amt >= 0) {
      incomeTotalCents += amt;
    } else {
      const abs = -amt;
      if (t.categoryId && savingsCatId && t.categoryId === savingsCatId) {
        // Sparbuchungen sind per Konvention negativ (Abgang vom Girokonto zum Sparkonto)
        monthlySavingsActualCents += abs;
      } else {
        outcomeTotalCents += abs;
        const key = t.categoryId ?? "uncategorized";
        byCategoryCents[key] = (byCategoryCents[key] ?? 0) + abs;
      }
    }
  }

  // Geplante Ersparnis (Budget ohne Kategorie) für den aktuellen Monat
  const { month, year } = getMonthYear(now);
  const plannedBudgetAgg = await prisma.budget.aggregate({
    where: { accountId, categoryId: null, month, year },
    _sum: { amountCents: true }
  });
  const plannedSavings = (plannedBudgetAgg._sum.amountCents ?? 0) / 100;

  // Kategoriebudgets für den aktuellen Monat
  const categoryBudgetsRaw = await prisma.budget.findMany({
    where: { accountId, categoryId: { not: null }, month, year },
    select: { categoryId: true, amountCents: true }
  });

  // Daueraufträge für den aktuellen Monat
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

  const recurringThisMonth = recurringTransactions.filter((rec) => {
    const nextDate = new Date(rec.nextOccurrence);
    const nextYear = nextDate.getFullYear();
    const nextMonth = nextDate.getMonth() + 1;
    if (nextYear === year && nextMonth === month) return true;
    const interval = rec.intervalMonths || 1;
    const monthsSinceNext = (year - nextYear) * 12 + (month - nextMonth);
    return monthsSinceNext >= 0 && monthsSinceNext % interval === 0;
  });

  const skips = await prisma.recurringTransactionSkip.findMany({
    where: {
      recurringId: { in: recurringThisMonth.map((r) => r.id) },
      year,
      month
    },
    select: { recurringId: true }
  });
  const skippedIds = new Set(skips.map((s) => s.recurringId));
  const activeRecurringThisMonth = recurringThisMonth.filter((r) => !skippedIds.has(r.id));

  // Dauerauftrag-Summen — ebenfalls in Cents
  // Sparbuchungs-Daueraufträge werden analog zu echten Sparbuchungen separat gezählt,
  // damit projectedRemaining konsistent mit remaining ist (beide schließen Sparen aus Ausgaben aus).
  let recurringIncomeTotalCents = 0;
  let recurringOutcomeTotalCents = 0;
  let recurringPlannedSavingsCents = 0;
  const recurringByCategoryCents: Record<string, number> = {};

  for (const rec of activeRecurringThisMonth) {
    const amt = rec.amountCents;
    if (amt >= 0) {
      recurringIncomeTotalCents += amt;
    } else {
      const abs = -amt;
      if (savingsCatId && rec.categoryId === savingsCatId) {
        recurringPlannedSavingsCents += abs;
      } else {
        recurringOutcomeTotalCents += abs;
        if (rec.categoryId) {
          recurringByCategoryCents[rec.categoryId] = (recurringByCategoryCents[rec.categoryId] || 0) + abs;
        }
      }
    }
  }

  const remainingCents = incomeTotalCents - outcomeTotalCents - monthlySavingsActualCents;

  // Tages-Chart: kumulierte Werte in Cents aufaddieren, erst bei Ausgabe durch 100 teilen
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDay = Array.from({ length: daysInMonth }, () => ({ inc: 0, out: 0, sav: 0 }));

  for (const t of txs) {
    const day = t.occurredAt.getDate();
    const idx = day - 1;
    const amt = t.amountCents;
    if (amt >= 0) {
      byDay[idx].inc += amt;
    } else if (savingsCatId && t.categoryId === savingsCatId) {
      byDay[idx].sav += -amt;
    } else {
      byDay[idx].out += -amt;
    }
  }

  for (const rec of activeRecurringThisMonth) {
    const day = Math.min(rec.dayOfMonth || 1, daysInMonth);
    const idx = day - 1;
    const amt = rec.amountCents;
    if (amt >= 0) {
      byDay[idx].inc += amt;
    } else if (savingsCatId && rec.categoryId === savingsCatId) {
      byDay[idx].sav += -amt;
    } else {
      byDay[idx].out += -amt;
    }
  }

  // Baseline-Sparbetrag (alle Sparbuchungen vor diesem Monat) — nur negative Buchungen zählen,
  // DB-Aggregation statt findMany + Loop
  let baselineSavingsCents = 0;
  if (savingsCatId) {
    const prevSavingsAgg = await prisma.transaction.aggregate({
      where: {
        accountId,
        categoryId: savingsCatId,
        occurredAt: { lt: start },
        amountCents: { lt: 0 }
      },
      _sum: { amountCents: true }
    });
    baselineSavingsCents = -(prevSavingsAgg._sum.amountCents ?? 0);
  }

  const incomeDaily: number[] = new Array(daysInMonth).fill(0);
  const outcomeDaily: number[] = new Array(daysInMonth).fill(0);
  const savingsDaily: number[] = new Array(daysInMonth).fill(0);
  let incRun = 0;
  let outRun = 0;
  let savRun = baselineSavingsCents;
  for (let i = 0; i < daysInMonth; i++) {
    incRun += byDay[i].inc;
    outRun += byDay[i].out;
    savRun += byDay[i].sav;
    const deficit = Math.max(0, outRun - incRun);
    const adjustedSavings = Math.max(0, savRun - deficit);
    incomeDaily[i] = incRun / 100;
    outcomeDaily[i] = outRun / 100;
    savingsDaily[i] = adjustedSavings / 100;
  }

  const projectedIncomeTotalCents = incomeTotalCents + recurringIncomeTotalCents;
  const projectedOutcomeTotalCents = outcomeTotalCents + recurringOutcomeTotalCents;
  const projectedSavingsTotalCents = monthlySavingsActualCents + recurringPlannedSavingsCents;
  const projectedRemainingCents = projectedIncomeTotalCents - projectedOutcomeTotalCents - projectedSavingsTotalCents;

  // Daueraufträge in Kategorie-Aufteilung einrechnen (beide in Cents)
  for (const [catId, amountCents] of Object.entries(recurringByCategoryCents)) {
    byCategoryCents[catId] = (byCategoryCents[catId] || 0) + amountCents;
  }

  // Kategorienamen auflösen für alle Kategorien mit Ausgaben oder Budget
  const updatedCatIds = Array.from(new Set([
    ...Object.keys(byCategoryCents).filter((id) => id !== "uncategorized"),
    ...categoryBudgetsRaw.map((b) => b.categoryId).filter((id): id is string => id !== null)
  ]));
  const updatedCategories = await prisma.category.findMany({
    where: { id: { in: updatedCatIds }, userId: user.id },
    select: { id: true, name: true }
  });
  const updatedNameMap: Record<string, string> = {};
  for (const c of updatedCategories) updatedNameMap[c.id] = c.name;

  // Erst hier — am Ende — von Cents in Euro konvertieren
  const finalOutgoingByCategory = Object.entries(byCategoryCents).map(([id, amountCents]) => ({
    id,
    name: id === "uncategorized" ? "Uncategorized" : updatedNameMap[id] ?? id,
    amount: amountCents / 100
  }));

  const categoryBudgets = categoryBudgetsRaw
    .filter((b): b is { categoryId: string; amountCents: number } => b.categoryId !== null)
    .map((b) => {
      const spentCents = byCategoryCents[b.categoryId] ?? 0;
      const budgetCents = b.amountCents;
      return {
        categoryId: b.categoryId,
        name: updatedNameMap[b.categoryId] ?? b.categoryId,
        budget: budgetCents / 100,
        spent: spentCents / 100,
        diff: (spentCents - budgetCents) / 100
      };
    });

  return NextResponse.json({
    totalBalance,
    carryoverFromLastMonth,
    incomeTotal: incomeTotalCents / 100,
    outcomeTotal: outcomeTotalCents / 100,
    outcomeTotalExclSavings: outcomeTotalCents / 100,
    monthlySavingsActual: monthlySavingsActualCents / 100,
    remaining: remainingCents / 100,
    plannedSavings,
    projectedIncomeTotal: projectedIncomeTotalCents / 100,
    projectedOutcomeTotal: projectedOutcomeTotalCents / 100,
    projectedRemaining: projectedRemainingCents / 100,
    outgoingByCategory: finalOutgoingByCategory,
    categoryBudgets,
    recurringTransactions: activeRecurringThisMonth.map((r) => ({
      id: r.id,
      description: r.description,
      amountCents: r.amountCents,
      categoryId: r.categoryId,
      dayOfMonth: r.dayOfMonth
    })),
    recurringIncomeTotal: recurringIncomeTotalCents / 100,
    recurringOutcomeTotal: recurringOutcomeTotalCents / 100,
    recurringPlannedSavings: recurringPlannedSavingsCents / 100,
    projectedSavingsTotal: projectedSavingsTotalCents / 100,
    daily: {
      labels: Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`),
      income: incomeDaily,
      outcome: outcomeDaily,
      savings: savingsDaily
    }
  });
}
