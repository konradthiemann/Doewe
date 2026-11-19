/**
 * GET  /api/budgets  — Alle Budgets des Nutzers (neueste Monate zuerst)
 * POST /api/budgets  — Neues Budget anlegen
 *
 * Ein Budget definiert einen Ziel-Betrag für eine Kategorie in einem bestimmten Monat.
 * Budget ohne categoryId (categoryId = null) ist das "Spar-Budget" für den Monat.
 * Unique-Constraint: (accountId, categoryId, month, year) — kein doppeltes Budget.
 *
 * POST Body: { accountId, categoryId?, month (1-12), year, amountCents }
 *
 * Vor dem Anlegen eines Kategorie-Budgets werden die abgeschlossenen Monate seit der
 * ersten Buchung, die noch keinen Snapshot haben, eingefroren (freezePastMonths,
 * lib/categoryBudgets.ts); ein Budget für einen dieser Monate ändert dessen Stand
 * nicht mehr.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { freezePastMonths } from "../../../lib/categoryBudgets";
import { prisma } from "../../../lib/prisma";

const BudgetInput = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1970).max(9999),
  amountCents: z.number().int()
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.budget.findMany({
    where: { account: { householdId: user.householdId } },
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = BudgetInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const account = await prisma.account.findFirst({ where: { id: parsed.data.accountId, householdId: user.householdId } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (parsed.data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: parsed.data.categoryId, householdId: user.householdId } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }

  // A category budget changes what budgets are computed from; months that are
  // over keep the budgets they had. (A row without category is a saving goal.)
  if (parsed.data.categoryId) await freezePastMonths(user.householdId);
  const created = await prisma.budget.create({ data: parsed.data });
  return NextResponse.json(created, { status: 201 });
}
