/**
 * GET  /api/saving-plan — Sparziele des Haushalts samt Spartopf und Sparrate
 * POST /api/saving-plan — Sparziel anlegen
 *
 * Authentifizierung: Pflicht (401). Haushaltsbezogen: Ziele aller Konten des
 * Haushalts, Spartopf über alle Spar-Kategorien und alle Konten.
 *
 * Ein Sparziel ist eine `Budget`-Zeile mit `categoryId = null`. Zeilen mit
 * Kategorie sind Kategorie-Budgets und gehören nicht in den Sparplan.
 *
 * GET Antwort: { goals, undatedGoals, completedGoals, totals }
 *   goals          — aktive Ziele mit Termin (Monat/Jahr), sortiert nach Termin
 *   undatedGoals   — aktive Ziele ohne Termin (Ideen-Liste)
 *   completedGoals — abgeschlossene Ziele
 *   totals         — siehe computeSavingPlanTotals (./compute.ts). Der Topf
 *                    (`rawAvailableCents`) ist die Summe der Sparbuchungen; ein
 *                    abgeschlossenes Ziel hat sein Geld als Buchung entnommen.
 *                    `withdrawnForCompletedCents` ist nur noch der Altbestand:
 *                    was Ziele zurückhalten, die vor den Entnahme-Buchungen
 *                    abgeschlossen wurden (`reservedCents`), sonst 0.
 *                    `availableCents` = Topf minus Altbestand, mindestens 0.
 *                    Die Sparrate (`suggestedMonthlyCents`) rechnet gegen den
 *                    Topf zu Beginn des laufenden Berliner Monats.
 *   `transactionSpentCents` je Ziel: Ausgaben der verknüpften, nicht gelöschten
 *                    Buchungen minus verknüpfte Erstattungen, mindestens 0
 *                    (classifyFlow; Buchungen einer Spar-Kategorie zählen nicht).
 *
 * POST Body: { accountId, title, targetMonth?, targetYear?, amountCents? }
 *   (Monat und Jahr nur gemeinsam; Alias `month`/`year`, `dueMonth`/`dueYear`)
 *   201 Budget-Zeile | 400 Validierung | 404 "Account not found"
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { loadSavingsCategoryIds } from "../../../lib/savingsCategory";
import { INT4_MAX } from "../transactions/schema";

import { computeSavingPlanTotals, linkedSpentCents } from "./compute";
import { resolveSavedThisMonthCents, resolveSavingsBalanceCents } from "./savings";

const SavingPlanInput = z
  .object({
    accountId: z.string().min(1),
    // trim().min(1) statt eines werfenden Transforms: ein Titel nur aus
    // Leerraum ist ein 400, kein 500.
    title: z.string().trim().min(1),
    // Undated goals omit month/year; amount is optional for idea-backlog goals.
    targetMonth: z.number().int().min(1).max(12).nullish(),
    targetYear: z.number().int().min(1970).max(9999).nullish(),
    amountCents: z.number().int().min(1).max(INT4_MAX).nullish()
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
  // haushaltsweit, nicht mehr nur das erste Konto.
  const account = await prisma.account.findFirst({ where: { householdId: user.householdId }, select: { id: true } });
  if (!account) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  const now = new Date();
  // Einmal geladen, damit Topf und Monats-Einzahlungen dieselben Kategorien meinen.
  const savingsIds = await loadSavingsCategoryIds(user.householdId);

  const [goalsRaw, rawSavingsBalanceCents, savedThisMonthCents] = await Promise.all([
    prisma.budget.findMany({
      // Sparziele = Budget-Zeilen ohne Kategorie, über alle Konten des Haushalts.
      where: { account: { householdId: user.householdId }, categoryId: null },
      orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
      include: {
        category: { select: { name: true } },
        // Der Soft-Delete-Filter aus lib/prisma.ts greift nur im obersten
        // `where` — gelöschte Buchungen hier selbst ausschließen.
        transactions: { where: { deletedAt: null }, select: { amountCents: true, categoryId: true } }
      }
    }),
    resolveSavingsBalanceCents(user.householdId, savingsIds),
    resolveSavedThisMonthCents(user.householdId, now, savingsIds)
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
    transactionSpentCents: linkedSpentCents(goal.transactions, savingsIds),
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

  // computeSavingPlanTotals holds back what goals completed before withdrawals
  // were booked still reserve, and measures the suggested monthly rate against
  // the pool at the start of the current month (hence this month's net deposits).
  const totals = computeSavingPlanTotals(
    goalsRaw.map((goal) => ({
      amountCents: goal.amountCents,
      completedAt: goal.completedAt,
      reservedCents: goal.reservedCents,
      month: goal.month,
      year: goal.year
    })),
    rawSavingsBalanceCents,
    now,
    savedThisMonthCents
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

  const account = await prisma.account.findFirst({ where: { id: payload.accountId, householdId: user.householdId } });
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
