/**
 * GET /api/analytics/summary
 *
 * Das Herzstück des Dashboards. Liefert alle Finanzdaten für den aktuellen Monat
 * (Kalender Europe/Berlin, alle Konten des Haushalts — siehe
 * docs/calculations/00-grundregeln.md):
 *
 * - `totalBalance`          — Kontostand: Summe aller Buchungen bis zum Ende des laufenden
 *                             Monats (für spätere Monate vorerfasste Buchungen zählen nicht)
 * - `carryoverFromLastMonth`— Übertrag: Summe aller Buchungen vor Beginn des laufenden Monats
 * - `incomeTotal`           — Summe aller gebuchten Einnahmen diesen Monat
 * - `outcomeTotal`          — Summe aller gebuchten Ausgaben (ohne Sparbuchungen) diesen Monat
 * - `monthlySavingsActual`  — Gebuchtes Sparen diesen Monat, netto (Einzahlungen − Entnahmen)
 * - `plannedSavings`        — Budget-Ziel ohne Kategorie (= Sparziel) für diesen Monat
 * - `completedGoals`        — In diesem Monat (per completedAt) als erledigt markierte Sparziele
 * - `completedGoalsSpent`   — Summe ihrer Kosten (`spentCents`, Euro)
 * - `projectedIncomeTotal`  — Hochrechnung inkl. noch nicht gebuchter Daueraufträge
 * - `projectedOutcomeTotal` — Hochrechnung Ausgaben inkl. Daueraufträge
 * - `projectedRemaining`    — Voraussichtlich verbleibendes Geld
 * - `outgoingByCategory`    — Ausgaben aufgeteilt nach Kategorien (inkl. geplanter Daueraufträge;
 *                             ohne Kategorie = `uncategorized`). Summe = `projectedOutcomeTotal`
 * - `categoryBudgets`       — Budget vs. Ist pro Kategorie; effektives Budget = Budget-Plan
 *                             (MONTHLY/YEARLY), Vorrang vor einem Monats-Budget; auch bei spent 0
 * - `recurringTransactions` — GEPLANTE Daueraufträge: diesen Monat fällig, nicht übersprungen
 *                             und für diesen Monat noch nicht gebucht
 * - `recurringIncomeTotal`, `recurringOutcomeTotal`, `recurringPlannedSavings`
 *                           — Summen der geplanten Daueraufträge (Euro, positive Beträge;
 *                             Spar-Daueraufträge nur in `recurringPlannedSavings`)
 * - `recurringDueIncomeTotal`, `recurringDueOutcomeTotal`
 *                           — Summen ALLER diesen Monat fälligen, nicht übersprungenen
 *                             Daueraufträge, ob schon gebucht oder nicht (Euro, positive
 *                             Beträge, ohne Spar-Daueraufträge). Bleiben über den Monat
 *                             konstant — Grundlage der Fixkostenquote
 * - `recurringDueCount`     — Anzahl dieser fälligen Daueraufträge (inkl. Spar-Daueraufträge)
 * - `daily`                 — Tagesweise kumulierte Linien für das Chart (income, outcome, savings)
 * - `recurringSuggestions`  — Vorschläge: je offenem Vorkommen dieses Monats (fällig, nicht
 *                             gebucht, nicht übersprungen, nicht vor `bookFromPeriod`) die von
 *                             Hand erfasste Buchung, die dafür stehen könnte
 *                             ({ recurringId, period, dueDay, transactionId,
 *                             transactionDescription, transactionOccurredAt, amountCents });
 *                             leer, wenn es keine gibt. Verknüpft wird erst auf Bestätigung
 *                             (POST /api/recurring-transactions/[id]/link-booking); bis dahin
 *                             zählt die Buchung als gebucht und das Vorkommen als geplant
 *
 * Einordnung (classifyFlow): Buchungen in einer Spar-Kategorie — jede Kategorie des Haushalts,
 * deren Name getrimmt und ohne Beachtung der Groß-/Kleinschreibung "savings" oder "sparen"
 * lautet — sind Sparen, unabhängig vom Vorzeichen (Einzahlung negativ, Entnahme positiv).
 * Alles andere ist nach Vorzeichen Einnahme (>= 0) oder Ausgabe (< 0).
 *
 * Ein Vorkommen eines Dauerauftrags gilt als gebucht, sobald eine Buchung mit dessen
 * `recurringTransactionId` und der Periode des Monats existiert — auch wenn sie gelöscht oder
 * in einen anderen Monat verschoben wurde (siehe lib/recurringPeriods.ts).
 *
 * Vor dem Rechnen bucht die Route fällige, noch nicht gebuchte Vorkommen abgeschlossener
 * Monate nach (siehe lib/recurringBooking.ts). Dieses GET kann also schreiben — aber nur das;
 * die Vorschläge werden nur gelesen, nichts wird automatisch verknüpft.
 *
 * 404, wenn der Haushalt kein Konto hat.
 */
import {
  addFlow,
  classifyFlow,
  daysInMonth,
  emptyFlowTotals,
  isRecurringDueInMonth,
  monthKey,
  zonedDate,
  zonedMonth,
  zonedMonthRange,
  type FlowRow
} from "@doewe/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // Kein Build-Time-Prerendering — Daten sind nutzer- und zeitabhängig

import { getSessionUser } from "../../../../lib/auth";
import { loadEffectiveCategoryBudgets } from "../../../../lib/categoryBudgets";
import { prisma } from "../../../../lib/prisma";
import { catchUpPastRecurringForHousehold, loadRecurringSuggestions } from "../../../../lib/recurringBooking";
import { loadBookedOccurrenceKeys, occurrenceKey } from "../../../../lib/recurringPeriods";
import { loadSavingsCategoryIds } from "../../../../lib/savingsCategory";

const UNCATEGORIZED = "uncategorized";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = user.householdId;
  const anyAccount = await prisma.account.findFirst({ where: { householdId }, select: { id: true } });
  if (!anyAccount) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  // Alle Konten des Haushalts — derselbe Umfang wie die Buchungsliste.
  const inHousehold = { account: { householdId } };
  const now = new Date();

  // Selbstheilung: fällige, nie gebuchte Daueraufträge abgeschlossener Monate
  // nachbuchen, bevor gerechnet wird (siehe catchUpPastRecurringForHousehold).
  await catchUpPastRecurringForHousehold(householdId, now);

  // Laufender Monat im App-Kalender (Europe/Berlin), halboffen [start, end).
  const { year, month } = zonedMonth(now);
  const { start, end } = zonedMonthRange(year, month);

  // Kontostand: alles bis zum Ende des laufenden Monats. DB berechnet die Summe direkt.
  const totalBalanceAgg = await prisma.transaction.aggregate({
    where: { ...inHousehold, occurredAt: { lt: end } },
    _sum: { amountCents: true }
  });
  const totalBalanceCents = totalBalanceAgg._sum.amountCents ?? 0;

  // Übertrag: alles vor Beginn des laufenden Monats.
  const carryoverAgg = await prisma.transaction.aggregate({
    where: { ...inHousehold, occurredAt: { lt: start } },
    _sum: { amountCents: true }
  });
  const carryoverCents = carryoverAgg._sum.amountCents ?? 0;

  const savingsIds = await loadSavingsCategoryIds(householdId);

  // Alle Buchungen des laufenden Monats
  const txs = await prisma.transaction.findMany({
    where: { ...inHousehold, occurredAt: { gte: start, lt: end } },
    select: { amountCents: true, categoryId: true, occurredAt: true }
  });

  // Tages-Chart: je Kalendertag (Berlin) in Cents sammeln, erst bei Ausgabe durch 100 teilen
  const dayCount = daysInMonth(year, month);
  const byDay = Array.from({ length: dayCount }, () => ({ inc: 0, out: 0, sav: 0 }));
  const addToDay = (day: number, row: FlowRow) => {
    const bucket = byDay[Math.min(Math.max(day, 1), dayCount) - 1];
    const kind = classifyFlow(row, savingsIds);
    if (kind === "savings") bucket.sav -= row.amountCents;
    else if (kind === "income") bucket.inc += row.amountCents;
    else bucket.out -= row.amountCents;
  };

  // Gebucht: alle Monats-Aggregationen in Integer-Cents
  const booked = emptyFlowTotals();
  const byCategoryCents: Record<string, number> = {};
  for (const t of txs) {
    if (addFlow(booked, t, savingsIds) === "outcome") {
      const key = t.categoryId ?? UNCATEGORIZED;
      byCategoryCents[key] = (byCategoryCents[key] ?? 0) - t.amountCents;
    }
    addToDay(zonedDate(t.occurredAt).day, t);
  }

  // Geplante Ersparnis (Budget ohne Kategorie) für den aktuellen Monat.
  // Abgeschlossene Ziele (completedAt gesetzt) zählen nicht mehr als geplant.
  const plannedBudgetAgg = await prisma.budget.aggregate({
    where: { ...inHousehold, categoryId: null, month, year, completedAt: null },
    _sum: { amountCents: true }
  });
  const plannedSavings = (plannedBudgetAgg._sum.amountCents ?? 0) / 100;

  // Sparziele, die in DIESEM Monat als erledigt markiert wurden (per completedAt,
  // also dem Zeitpunkt der Entnahme/des Abhakens — unabhängig vom Zielmonat).
  const completedGoalsRaw = await prisma.budget.findMany({
    where: { ...inHousehold, categoryId: null, completedAt: { gte: start, lt: end } },
    select: { title: true, amountCents: true, spentCents: true, completedAt: true },
    orderBy: { completedAt: "asc" }
  });
  const completedGoals = completedGoalsRaw.map((g) => ({
    title: g.title,
    target: (g.amountCents ?? 0) / 100,
    spent: (g.spentCents ?? 0) / 100,
    completedAt: g.completedAt
  }));
  const completedGoalsSpent = completedGoalsRaw.reduce((sum, g) => sum + (g.spentCents ?? 0), 0) / 100;

  // Kategoriebudgets für den aktuellen Monat
  const categoryBudgetsRaw = await loadEffectiveCategoryBudgets({ householdId, year, month });

  // Daueraufträge, die diesen Monat fällig sind (Anker-Monat im App-Kalender)
  const recurringTransactions = await prisma.recurringTransaction.findMany({
    where: inHousehold,
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
    const anchor = zonedMonth(rec.nextOccurrence);
    return isRecurringDueInMonth({
      nextYear: anchor.year,
      nextMonth: anchor.month,
      intervalMonths: rec.intervalMonths,
      year,
      month
    });
  });
  const recurringIds = recurringThisMonth.map((r) => r.id);

  const skips = await prisma.recurringTransactionSkip.findMany({
    where: { recurringId: { in: recurringIds }, year, month },
    select: { recurringId: true }
  });
  const skippedIds = new Set(skips.map((s) => s.recurringId));

  // Fällig = diesen Monat fällig und nicht übersprungen, ob gebucht oder nicht.
  const dueRecurring = recurringThisMonth.filter((r) => !skippedIds.has(r.id));

  // Geplant = fällig und für diesen Monat noch nicht gebucht. Ein gebuchtes
  // Vorkommen steckt schon in den gebuchten Summen (oder wurde vom Nutzer
  // gelöscht/verschoben) und darf nicht nochmal als "geplant" zählen — erkannt
  // über (recurringTransactionId, Periode), nicht über den Monat von occurredAt.
  const bookedKeys = await loadBookedOccurrenceKeys(recurringIds);
  const period = monthKey({ year, month });
  const plannedRecurring = dueRecurring.filter((r) => !bookedKeys.has(occurrenceKey(r.id, period)));

  // Fixkosten-Basis: alle fälligen Daueraufträge. Spar-Daueraufträge sind
  // weder Einnahme noch Ausgabe und zählen in den beiden Summen nicht mit.
  const due = emptyFlowTotals();
  for (const rec of dueRecurring) addFlow(due, rec, savingsIds);

  // Geplante Daueraufträge — Sparen separat, damit projectedRemaining
  // konsistent mit remaining ist (beide schließen Sparen aus Ausgaben aus).
  const planned = emptyFlowTotals();
  for (const rec of plannedRecurring) {
    if (addFlow(planned, rec, savingsIds) === "outcome") {
      const key = rec.categoryId ?? UNCATEGORIZED;
      byCategoryCents[key] = (byCategoryCents[key] ?? 0) - rec.amountCents;
    }
    addToDay(rec.dayOfMonth || 1, rec);
  }

  // Baseline-Sparstand (netto vor diesem Monat) — Einzahlungen (negativ) und
  // Entnahmen (positiv) werden verrechnet, damit die kumulative Sparlinie stimmt.
  let baselineSavingsCents = 0;
  if (savingsIds.size > 0) {
    const prevSavingsAgg = await prisma.transaction.aggregate({
      where: { ...inHousehold, categoryId: { in: [...savingsIds] }, occurredAt: { lt: start } },
      _sum: { amountCents: true }
    });
    baselineSavingsCents = -(prevSavingsAgg._sum.amountCents ?? 0);
  }

  const incomeDaily: number[] = new Array(dayCount).fill(0);
  const outcomeDaily: number[] = new Array(dayCount).fill(0);
  const savingsDaily: number[] = new Array(dayCount).fill(0);
  let incRun = 0;
  let outRun = 0;
  let savRun = baselineSavingsCents;
  for (let i = 0; i < dayCount; i++) {
    incRun += byDay[i].inc;
    outRun += byDay[i].out;
    savRun += byDay[i].sav;
    const deficit = Math.max(0, outRun - incRun);
    const adjustedSavings = Math.max(0, savRun - deficit);
    incomeDaily[i] = incRun / 100;
    outcomeDaily[i] = outRun / 100;
    savingsDaily[i] = adjustedSavings / 100;
  }

  // Von Hand erfasste Buchungen, die wie ein offenes Vorkommen aussehen — nur
  // vorgeschlagen, nicht verknüpft (das entscheidet der Nutzer).
  const recurringSuggestions = await loadRecurringSuggestions(householdId, now);

  const projectedIncomeTotalCents = booked.incomeCents + planned.incomeCents;
  const projectedOutcomeTotalCents = booked.outcomeCents + planned.outcomeCents;
  const projectedSavingsTotalCents = booked.savingsCents + planned.savingsCents;
  const projectedRemainingCents = projectedIncomeTotalCents - projectedOutcomeTotalCents - projectedSavingsTotalCents;

  // Kategorienamen auflösen für alle Kategorien mit Ausgaben oder Budget
  const updatedCatIds = Array.from(new Set([
    ...Object.keys(byCategoryCents).filter((id) => id !== UNCATEGORIZED),
    ...Object.keys(categoryBudgetsRaw)
  ]));
  const updatedCategories = await prisma.category.findMany({
    where: { id: { in: updatedCatIds }, householdId },
    select: { id: true, name: true }
  });
  const updatedNameMap: Record<string, string> = {};
  for (const c of updatedCategories) updatedNameMap[c.id] = c.name;

  // Erst hier — am Ende — von Cents in Euro konvertieren
  const finalOutgoingByCategory = Object.entries(byCategoryCents).map(([id, amountCents]) => ({
    id,
    name: id === UNCATEGORIZED ? "Uncategorized" : updatedNameMap[id] ?? id,
    amount: amountCents / 100
  }));

  const categoryBudgets = Object.entries(categoryBudgetsRaw).map(([categoryId, budgetCents]) => {
    const spentCents = byCategoryCents[categoryId] ?? 0;
    return {
      categoryId,
      name: updatedNameMap[categoryId] ?? categoryId,
      budget: budgetCents / 100,
      spent: spentCents / 100,
      diff: (spentCents - budgetCents) / 100
    };
  });

  return NextResponse.json({
    totalBalance: totalBalanceCents / 100,
    carryoverFromLastMonth: carryoverCents / 100,
    incomeTotal: booked.incomeCents / 100,
    outcomeTotal: booked.outcomeCents / 100,
    outcomeTotalExclSavings: booked.outcomeCents / 100,
    monthlySavingsActual: booked.savingsCents / 100,
    // income − outcome − savings of the booked rows
    remaining: booked.netCents / 100,
    plannedSavings,
    completedGoals,
    completedGoalsSpent,
    projectedIncomeTotal: projectedIncomeTotalCents / 100,
    projectedOutcomeTotal: projectedOutcomeTotalCents / 100,
    projectedRemaining: projectedRemainingCents / 100,
    outgoingByCategory: finalOutgoingByCategory,
    categoryBudgets,
    recurringTransactions: plannedRecurring.map((r) => ({
      id: r.id,
      description: r.description,
      amountCents: r.amountCents,
      categoryId: r.categoryId,
      dayOfMonth: r.dayOfMonth
    })),
    recurringIncomeTotal: planned.incomeCents / 100,
    recurringOutcomeTotal: planned.outcomeCents / 100,
    recurringPlannedSavings: planned.savingsCents / 100,
    recurringDueIncomeTotal: due.incomeCents / 100,
    recurringDueOutcomeTotal: due.outcomeCents / 100,
    recurringDueCount: dueRecurring.length,
    projectedSavingsTotal: projectedSavingsTotalCents / 100,
    recurringSuggestions,
    daily: {
      labels: Array.from({ length: dayCount }, (_, i) => `${i + 1}`),
      income: incomeDaily,
      outcome: outcomeDaily,
      savings: savingsDaily
    }
  });
}
