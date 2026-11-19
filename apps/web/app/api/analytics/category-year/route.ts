/**
 * GET /api/analytics/category-year?year=YYYY
 *
 * Authentifizierung: Pflicht (401). Liefert eine CategoryYearMatrix (siehe @doewe/shared):
 * die tatsächlichen Buchungen des Jahres je Kategorie und Monat (Cent), gruppiert in
 * Einnahmen / Ausgaben / Sparen, mit Gruppensummen und Saldo (Einnahmen - Ausgaben - Sparen).
 *
 * - Jahr und Monat = Kalender Europe/Berlin von `occurredAt` (siehe
 *   docs/calculations/00-grundregeln.md); Soft-Deletes und Buchungen anderer Jahre zählen nicht.
 * - Gruppe je BUCHUNG (classifyFlow, wie im Rückblick): Spar-Kategorie (Name getrimmt,
 *   ohne Beachtung der Groß-/Kleinschreibung savings/sparen) -> Sparen, sonst das Vorzeichen:
 *   >= 0 Einnahmen, < 0 Ausgaben. `Category.isIncome` entscheidet nichts. Eine Kategorie kann
 *   deshalb in Einnahmen UND Ausgaben stehen (Erstattung in "Lebensmittel" = Einnahmen-Zeile,
 *   negative Buchung in "Gehalt" = Ausgaben-Zeile). Ausgaben-Zeilen sind brutto. Die
 *   Gruppensummen eines Monats entsprechen dem Rückblick dieses Monats.
 *   Buchungen ohne Kategorie erscheinen als Zeile `uncategorized`.
 * - Je Ausgaben-Zeile das effektive Monatsbudget (Plan vor Monats-Budget, siehe
 *   loadEffectiveCategoryBudgetsForYear) und die Monate, in denen es überschritten wurde.
 *   Eine Kategorie mit Budget, aber ohne Ausgaben, erscheint als Ausgaben-Zeile mit 0.
 *
 * Query: year (ganze Zahl 2000-2100, optional, Default aktuelles Jahr), sonst 400.
 * Haushaltsbezogen (alle Konten des Haushalts); 404, wenn der Haushalt kein Konto hat.
 * Vor dem Rechnen werden fällige, nie gebuchte Daueraufträge abgeschlossener Monate
 * nachgebucht (wie in summary und monthly-review). Kein DEMO-Ausschluss: der Demo-Nutzer
 * sieht nur seine eigenen Daten, es wird nichts übergreifend aggregiert.
 */
import { buildCategoryYearMatrix, zonedDate, zonedMonth, zonedYearRange } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { loadEffectiveCategoryBudgetsForYear } from "../../../../lib/categoryBudgets";
import { prisma } from "../../../../lib/prisma";
import { catchUpPastRecurringForHousehold } from "../../../../lib/recurringBooking";
import { loadSavingsCategoryIds } from "../../../../lib/savingsCategory";

export const dynamic = "force-dynamic";

const CategoryYearQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100)
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawYear = new URL(request.url).searchParams.get("year");
  const now = new Date();
  const parsed = CategoryYearQuery.safeParse({ year: rawYear ?? zonedDate(now).year });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { year } = parsed.data;

  const householdId = user.householdId;
  const anyAccount = await prisma.account.findFirst({ where: { householdId }, select: { id: true } });
  if (!anyAccount) return NextResponse.json({ error: "No account found for user" }, { status: 404 });

  // Selbstheilung: fällige, nie gebuchte Daueraufträge abgeschlossener Monate
  // nachbuchen, bevor gerechnet wird (siehe catchUpPastRecurringForHousehold).
  await catchUpPastRecurringForHousehold(householdId, now);

  const { start, end } = zonedYearRange(year);
  const [transactionRows, categories, savingsIds, budgetsByCategory] = await Promise.all([
    prisma.transaction.findMany({
      where: { account: { householdId }, deletedAt: null, occurredAt: { gte: start, lt: end } },
      select: { categoryId: true, amountCents: true, occurredAt: true }
    }),
    prisma.category.findMany({
      where: { householdId, deletedAt: null },
      select: { id: true, name: true }
    }),
    loadSavingsCategoryIds(householdId),
    loadEffectiveCategoryBudgetsForYear({ householdId, year })
  ]);

  const transactions = transactionRows.map((t) => ({
    categoryId: t.categoryId,
    amountCents: t.amountCents,
    month: zonedMonth(t.occurredAt).month
  }));

  return NextResponse.json(
    buildCategoryYearMatrix({ year, categories, savingsIds, transactions, budgetsByCategory })
  );
}
