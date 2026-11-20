/**
 * GET  /api/saving-plan — Sparziele des Haushalts samt Plan-Summen
 * POST /api/saving-plan — Sparziel anlegen
 *
 * Authentifizierung: Pflicht (401). Haushaltsbezogen: Ziele aller Konten des
 * Haushalts.
 *
 * Ein Sparziel ist eine `Budget`-Zeile mit `categoryId = null`. Zeilen mit
 * Kategorie sind Kategorie-Budgets und gehören nicht in den Sparplan.
 *
 * Die App führt keinen Spar-Bestand (docs/calculations/07-sparziele.md): Eine
 * Sparbuchung verlässt den Monat, was danach auf dem Sparkonto liegt, liegt
 * außerhalb der App.
 *
 * GET Antwort: { goals, undatedGoals, completedGoals, totals }
 *   goals          — aktive Ziele mit Termin (Monat/Jahr), sortiert nach Termin
 *   undatedGoals   — aktive Ziele ohne Termin (Ideen-Liste)
 *   completedGoals — abgeschlossene Ziele
 *   je Ziel u. a.:
 *     monthlyRateCents          — geplante Monatsrate, null = keine
 *     suggestedMonthlyRateCents — Zielbetrag ÷ Monate bis zum Termin (aufgerundet), null ohne Betrag/Termin
 *     transactionSpentCents     — aus dem Monatsbudget: verknüpfte Buchungen, Ausgaben
 *                                 minus Erstattungen, mindestens 0 (classifyFlow;
 *                                 Buchungen einer Spar-Kategorie zählen nicht)
 *     savingsPaidCents          — aus dem Ersparten: Summe der Zahlungen am Ziel
 *     savingsPayments           — diese Zahlungen, neueste zuerst
 *   totals — siehe computeSavingPlanTotals (./compute.ts):
 *     totalTargetCents — Zielbeträge der aktiven Ziele mit Termin
 *     monthlyRateCents — Monatsraten der aktiven Ziele, deren Termin der laufende
 *                        Berliner Monat oder später ist; wird als Rate des
 *                        laufenden Monats festgehalten (lib/savingRate.ts)
 *
 * POST Body: { accountId, title, targetMonth?, targetYear?, amountCents?, monthlyRateCents? }
 *   (Monat und Jahr nur gemeinsam; Alias `month`/`year`, `dueMonth`/`dueYear`.
 *   Eine Monatsrate gibt es nur mit Termin; ohne Termin wird sie nicht gespeichert.)
 *   201 Budget-Zeile | 400 Validierung | 404 "Account not found"
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { suggestMonthlyRateCents } from "../../../lib/savingGoalProgress";
import { recordSavingRate, refreshSavingRate } from "../../../lib/savingRate";
import { loadSavingsCategoryIds } from "../../../lib/savingsCategory";
import { INT4_MAX } from "../transactions/schema";

import { computeSavingPlanTotals, linkedSpentCents, savingsPaidCents } from "./compute";

const SavingPlanInput = z
  .object({
    accountId: z.string().min(1),
    // trim().min(1) statt eines werfenden Transforms: ein Titel nur aus
    // Leerraum ist ein 400, kein 500.
    title: z.string().trim().min(1),
    // Undated goals omit month/year; amount is optional for idea-backlog goals.
    targetMonth: z.number().int().min(1).max(12).nullish(),
    targetYear: z.number().int().min(1970).max(9999).nullish(),
    amountCents: z.number().int().min(1).max(INT4_MAX).nullish(),
    // 0 is a valid rate: "the money is there already".
    monthlyRateCents: z.number().int().min(0).max(INT4_MAX).nullish()
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

  // Unverändertes Verhalten für einen Haushalt ohne Konto; gelesen wird danach
  // haushaltsweit, nicht nur das erste Konto.
  const account = await prisma.account.findFirst({ where: { householdId: user.householdId }, select: { id: true } });
  if (!account) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  const now = new Date();
  const [goalsRaw, savingsIds] = await Promise.all([
    prisma.budget.findMany({
      // Sparziele = Budget-Zeilen ohne Kategorie, über alle Konten des Haushalts.
      where: { account: { householdId: user.householdId }, categoryId: null },
      orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
      include: {
        category: { select: { name: true } },
        // Der Soft-Delete-Filter aus lib/prisma.ts greift nur im obersten
        // `where` — gelöschte Buchungen hier selbst ausschließen.
        transactions: { where: { deletedAt: null }, select: { amountCents: true, categoryId: true } },
        savingsPayments: {
          select: { id: true, amountCents: true, occurredAt: true, note: true },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }]
        }
      }
    }),
    loadSavingsCategoryIds(user.householdId)
  ]);

  const mapGoal = (goal: (typeof goalsRaw)[number]) => {
    const deadline = goal.month != null && goal.year != null ? { year: goal.year, month: goal.month } : null;
    return {
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
      monthlyRateCents: deadline ? goal.monthlyRateCents : null,
      suggestedMonthlyRateCents: suggestMonthlyRateCents(goal.amountCents, deadline, now),
      transactionSpentCents: linkedSpentCents(goal.transactions, savingsIds),
      savingsPaidCents: savingsPaidCents(goal.savingsPayments),
      savingsPayments: goal.savingsPayments,
      completedAt: goal.completedAt,
      spentCents: goal.spentCents,
      createdAt: goal.createdAt
    };
  };

  // Active, dated goals drive the plan (timeline).
  // Active, undated goals are an idea backlog shown separately.
  // Completed goals are kept for history.
  const activeRaw = goalsRaw.filter((goal) => goal.completedAt == null);
  const goals = activeRaw.filter((goal) => goal.month != null && goal.year != null).map(mapGoal);
  const undatedGoals = activeRaw.filter((goal) => goal.month == null || goal.year == null).map(mapGoal);
  const completedGoals = goalsRaw.filter((goal) => goal.completedAt != null).map(mapGoal);

  const totals = computeSavingPlanTotals(goalsRaw, now);
  // The review compares each month with the rate that applied then.
  await recordSavingRate(user.householdId, totals.monthlyRateCents, now);

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

  const json = await req.json().catch(() => null);
  const parsed = SavingPlanInput.safeParse({
    ...json,
    targetMonth: json?.targetMonth ?? json?.month ?? json?.dueMonth,
    targetYear: json?.targetYear ?? json?.year ?? json?.dueYear
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  const account = await prisma.account.findFirst({ where: { id: payload.accountId, householdId: user.householdId } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const dated = payload.targetMonth != null && payload.targetYear != null;
  const created = await prisma.budget.create({
    data: {
      accountId: payload.accountId,
      categoryId: null,
      title: payload.title,
      month: payload.targetMonth ?? null,
      year: payload.targetYear ?? null,
      amountCents: payload.amountCents ?? null,
      // A rate needs a deadline; an undated idea has none.
      monthlyRateCents: dated ? (payload.monthlyRateCents ?? null) : null
    }
  });

  await refreshSavingRate(user.householdId);
  return NextResponse.json(created, { status: 201 });
}
