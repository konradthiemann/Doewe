/**
 * GET  /api/budget-plans?year=YYYY — Budget-Pläne des Haushalts
 * POST /api/budget-plans           — Plan für eine Kategorie anlegen
 *
 * Ein Plan ist ein dauerhaftes Budget je Kategorie: MONTHLY (jeden Monat derselbe
 * Betrag) oder YEARLY (Jahresbetrag, gewichtet nach der geglätteten
 * Monats-Verfügbarkeit auf 12 Monate verteilt: Einnahmen gleichmäßig, Fixkosten und
 * Sparen je Monat). Der Plan hat Vorrang; ein Monats-Budget (/api/budgets) gilt nur
 * als Fallback für Kategorien ohne Plan.
 *
 * Authentifizierung: Pflicht (401). Haushaltsbezogen. Soft-Deletes werden ausgeblendet.
 *
 * GET Antwort: { year, availablePerMonthCents: number[12], plans: [{ id, categoryId,
 *   period, amountCents, createdAt, updatedAt, categoryName, monthlyCents: number[12] }],
 *   budgetableCategories: [{ id, name, planId | null }] }
 * POST Body: { categoryId, period: "MONTHLY" | "YEARLY", amountCents (1..1_000_000_000) }
 *   201 Plan-DTO | 400 (Validierung / "Category not budgetable") | 404 "Category not found"
 *   | 409 "Budget plan already exists for category". Ein soft-gelöschter Plan derselben
 *   Kategorie wird wiederbelebt (gleiche id).
 */
import { planMonthlyCents, smoothedAvailablePerMonth, type BudgetPeriod } from "@doewe/shared";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { loadRecurringYearMatrix } from "../../../lib/recurringYear";
import { SAVINGS_CATEGORY_NAMES } from "../saving-plan/savings";

import { CreateBudgetPlanSchema, ListQuerySchema, toPlanDto } from "./schema";

export const dynamic = "force-dynamic";

function isSavingsName(name: string): boolean {
  return SAVINGS_CATEGORY_NAMES.includes(name.toLowerCase().trim());
}

function asPeriod(value: string): BudgetPeriod {
  return value === "YEARLY" ? "YEARLY" : "MONTHLY";
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ListQuerySchema.safeParse({ year: new URL(req.url).searchParams.get("year") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { year } = parsed.data;

  const [matrix, planRows, categories] = await Promise.all([
    loadRecurringYearMatrix(user.householdId, year),
    prisma.categoryBudgetPlan.findMany({
      where: { householdId: user.householdId, category: { deletedAt: null } },
      include: { category: { select: { name: true } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.category.findMany({
      where: { householdId: user.householdId, isIncome: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    })
  ]);
  const availablePerMonthCents = smoothedAvailablePerMonth(matrix);

  const plans = planRows.map((row) => ({
    ...toPlanDto(row),
    categoryName: row.category.name,
    monthlyCents: planMonthlyCents({ period: asPeriod(row.period), amountCents: row.amountCents }, availablePerMonthCents)
  }));
  const planIdByCategory = new Map(planRows.map((row) => [row.categoryId, row.id]));
  const budgetableCategories = categories
    .filter((c) => !isSavingsName(c.name))
    .map((c) => ({ id: c.id, name: c.name, planId: planIdByCategory.get(c.id) ?? null }));

  return NextResponse.json({ year, availablePerMonthCents, plans, budgetableCategories });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json: unknown = await req.json().catch(() => null);
  const parsed = CreateBudgetPlanSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { categoryId, period, amountCents } = parsed.data;

  // Soft-deleted categories are hidden by the extension -> 404 as well.
  const category = await prisma.category.findFirst({
    where: { id: categoryId, householdId: user.householdId },
    select: { id: true, name: true, isIncome: true }
  });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  if (category.isIncome || isSavingsName(category.name)) {
    return NextResponse.json({ error: "Category not budgetable" }, { status: 400 });
  }

  // findUnique is not filtered by the soft-delete extension: tombstones are visible here.
  const existing = await prisma.categoryBudgetPlan.findUnique({ where: { categoryId } });
  if (existing && existing.deletedAt === null) {
    return NextResponse.json({ error: "Budget plan already exists for category" }, { status: 409 });
  }

  const plan = existing
    ? await prisma.categoryBudgetPlan.update({
        where: { id: existing.id },
        data: { period, amountCents, deletedAt: null }
      })
    : await prisma.categoryBudgetPlan.create({
        data: { householdId: user.householdId, categoryId, period, amountCents }
      });
  return NextResponse.json(toPlanDto(plan), { status: 201 });
}
