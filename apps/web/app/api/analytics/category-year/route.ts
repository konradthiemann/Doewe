/**
 * GET /api/analytics/category-year?year=YYYY
 *
 * Authentifizierung: Pflicht (401). Liefert eine CategoryYearMatrix (siehe @doewe/shared):
 * die tatsächlichen Buchungen des Jahres je Kategorie und Monat (Cent), gruppiert in
 * Einnahmen / Ausgaben / Sparen, mit Gruppensummen und Saldo (Einnahmen - Ausgaben - Sparen).
 *
 * - Monat = lokaler Monat von `occurredAt`; Soft-Deletes und Buchungen anderer Jahre zählen nicht.
 * - Gruppe je Kategorie: Spar-Kategorie (savings/sparen) -> Sparen, `isIncome` -> Einnahmen,
 *   sonst Ausgaben. Buchungen ohne Kategorie erscheinen als Zeile `uncategorized`.
 * - Je Ausgaben-Zeile das effektive Monatsbudget (Plan vor Monats-Budget, siehe
 *   loadEffectiveCategoryBudgetsForYear) und die Monate, in denen es überschritten wurde.
 *
 * Query: year (ganze Zahl 2000-2100, optional, Default aktuelles Jahr), sonst 400.
 * Haushaltsbezogen (erster Account des Haushalts, wie monthly-review). Kein DEMO-Ausschluss:
 * der Demo-Nutzer sieht nur seine eigenen Daten, es wird nichts übergreifend aggregiert.
 */
import { buildCategoryYearMatrix, type CategoryYearCategory, type CategoryYearKind } from "@doewe/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { loadEffectiveCategoryBudgetsForYear } from "../../../../lib/categoryBudgets";
import { prisma } from "../../../../lib/prisma";
import { SAVINGS_CATEGORY_NAMES } from "../../saving-plan/savings";

export const dynamic = "force-dynamic";

const CategoryYearQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100)
});

function categoryKind(category: { name: string; isIncome: boolean }): CategoryYearKind {
  if (SAVINGS_CATEGORY_NAMES.includes(category.name.toLowerCase().trim())) return "savings";
  return category.isIncome ? "income" : "expense";
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawYear = new URL(request.url).searchParams.get("year");
  const parsed = CategoryYearQuery.safeParse({ year: rawYear ?? new Date().getFullYear() });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { year } = parsed.data;

  const account = await prisma.account.findFirst({
    where: { householdId: user.householdId },
    orderBy: { createdAt: "asc" }
  });
  if (!account) return NextResponse.json({ error: "No account found for user" }, { status: 404 });

  const [transactionRows, categoryRows, budgetsByCategory] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        accountId: account.id,
        deletedAt: null,
        occurredAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) }
      },
      select: { categoryId: true, amountCents: true, occurredAt: true }
    }),
    prisma.category.findMany({
      where: { householdId: user.householdId, deletedAt: null },
      select: { id: true, name: true, isIncome: true }
    }),
    loadEffectiveCategoryBudgetsForYear({ householdId: user.householdId, accountId: account.id, year })
  ]);

  const categories: CategoryYearCategory[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    kind: categoryKind(c)
  }));
  const transactions = transactionRows.map((t) => ({
    categoryId: t.categoryId,
    amountCents: t.amountCents,
    month: t.occurredAt.getMonth() + 1
  }));

  return NextResponse.json(buildCategoryYearMatrix({ year, categories, transactions, budgetsByCategory }));
}
